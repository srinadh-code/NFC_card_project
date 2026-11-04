"""Automatic customer accounts for paid guest checkouts.

Called only from payments.services.fulfill_checkout — i.e. only after a
Razorpay payment has been verified on the backend (signature or webhook).

* New email -> a CUSTOMER account is created with a random temporary
  password (stored only as Django's normal password hash), flagged
  `must_change_password`, valid for TEMPORARY_PASSWORD_HOURS. The plaintext
  exists only in memory long enough to be emailed, and is never logged,
  stored or returned by any API.
* Existing email -> nothing about the account changes (no new account, no
  password reset); the order is simply attached to it and the normal order
  confirmation email goes out (orders/signals.py).

The welcome email is sent after the database transaction commits, in the
background with retries, so SMTP/Brevo availability never affects the
payment or the order. If every attempt fails, the CustomerOnboarding row
records it (admin "Account Activation" view) and a *new* temporary password
can be issued and sent (admin resend, the public "send me new login
details" form, or `manage.py retry_onboarding_emails`).
"""

import logging
import secrets
import string
import threading
import time
from datetime import timedelta

from django.conf import settings
from django.db import connection, transaction
from django.template.loader import render_to_string
from django.utils import timezone

from .models import CustomerOnboarding, User

logger = logging.getLogger("accounts.onboarding")

TEMPORARY_PASSWORD_HOURS = 24
# Delays before each retry of a failed welcome-email send.
EMAIL_RETRY_DELAYS_SECONDS = (2, 10)

WELCOME_SUBJECT = "Welcome to VRS GATEWAY – Your Order Is Confirmed!"

# No look-alike characters (0/O, 1/l/I) — the customer types this by hand.
_LOWER = "abcdefghijkmnopqrstuvwxyz"
_UPPER = "ABCDEFGHJKLMNPQRSTUVWXYZ"
_DIGITS = "23456789"
_SPECIAL = "@#$%&*?!"


def generate_temporary_password(length=12):
    """Cryptographically random password that satisfies the project's
    password policy (accounts/validators.py: lower, upper, digit, special,
    at most 12 characters)."""
    pools = [_LOWER, _UPPER, _DIGITS, _SPECIAL]
    chars = [secrets.choice(pool) for pool in pools]
    everything = "".join(pools)
    chars += [secrets.choice(everything) for _ in range(length - len(chars))]
    secrets.SystemRandom().shuffle(chars)
    return "".join(chars)


def normalize_email(email):
    return (email or "").strip().lower()


def find_customer_by_email(email):
    return User.objects.filter(email__iexact=normalize_email(email)).first()


def issue_temporary_password(user):
    """Gives `user` a fresh temporary password (replacing any previous one)
    and returns the plaintext for immediate emailing. Only for accounts
    still waiting for their first password setup."""
    raw = generate_temporary_password()
    user.set_password(raw)
    user.must_change_password = True
    user.temporary_password_expires_at = timezone.now() + timedelta(hours=TEMPORARY_PASSWORD_HOURS)
    user.save(update_fields=["password", "must_change_password", "temporary_password_expires_at"])
    CustomerOnboarding.objects.filter(user=user).update(
        credentials_issued_at=timezone.now(),
        email_status=CustomerOnboarding.EmailStatus.PENDING,
        email_last_error="",
    )
    return raw


def provision_customer(*, email, full_name, phone):
    """Returns (user, temporary_password). temporary_password is None when
    an account already existed for this email — that account is used as-is.
    Must run inside the caller's transaction (fulfill_checkout)."""
    email = normalize_email(email)
    existing = find_customer_by_email(email)
    if existing is not None:
        return existing, None

    user = User.objects.create_user(
        email=email,
        password=None,
        full_name=full_name.strip(),
        phone=phone.strip(),
        role=User.Role.CUSTOMER,
        is_active=True,
        # Proven when they log in with the password that was emailed to them.
        email_verified=False,
    )
    CustomerOnboarding.objects.create(user=user)
    # Profiles are normally created at registration (accounts/views.py
    # RegisterView); do the same here so the dashboard works on first login.
    from profiles.models import Profile

    Profile.ensure_for_user(user)
    raw = issue_temporary_password(user)
    logger.info("onboarding.account_created user_id=%s", user.pk)
    return user, raw


def _dashboard_login_url():
    return f"{settings.FRONTEND_URL.rstrip('/')}/login"


def _render_welcome(user, raw_password, order):
    first_item = order.items.first() if order is not None else None
    quantity = sum(i.qty for i in order.items.all()) if order is not None else 0
    product_names = ", ".join(dict.fromkeys(i.name for i in order.items.all())) if order is not None else ""
    context = {
        "subject": WELCOME_SUBJECT,
        "customer_name": user.full_name or user.email,
        "customer_email": user.email,
        "temporary_password": raw_password,
        "customer_dashboard_url": _dashboard_login_url(),
        "expiry_hours": TEMPORARY_PASSWORD_HOURS,
        "order_id": order.order_number if order is not None else "",
        "product_name": product_names or (first_item.name if first_item else ""),
        "quantity": quantity,
        "amount": f"₹{order.total:,.2f}" if order is not None else "",
        "order_status": order.get_status_display() if order is not None else "",
    }
    return (
        render_to_string("accounts/emails/welcome_credentials.html", context),
        render_to_string("accounts/emails/welcome_credentials.txt", context),
    )


def smtp_configured():
    """SMTP host from the environment (EMAIL_HOST) or Admin Settings > Email."""
    from website_content.models import EmailSettings

    row = EmailSettings.objects.first()
    return bool(getattr(settings, "EMAIL_HOST", "") or (row and row.smtp_host))


def _send_via_django(to_email, subject, html, text):
    from django.core.mail import EmailMultiAlternatives

    from .emails import _email_connection_and_sender

    connection_, from_email = _email_connection_and_sender()
    message = EmailMultiAlternatives(subject, text, from_email, [to_email], connection=connection_)
    message.attach_alternative(html, "text/html")
    message.send(fail_silently=False)
    return True


def send_email(to_email, subject, html, text, log_context):
    """Brevo when configured (production, where SMTP ports are blocked); if
    Brevo is missing or rejects the message (e.g. an invalid API key) and
    SMTP is configured, SMTP is tried next; otherwise Django's mail path
    (console locally, locmem in tests). Returns True on success; raises on an
    SMTP error. Never logs the body. send_brevo_email logs Brevo's own
    rejection reason (status/code/message) for diagnosis."""
    from .emails import send_brevo_email

    if settings.BREVO_API_KEY:
        if send_brevo_email(to_email, subject, html, text, log_context):
            return True
        if not smtp_configured():
            return False
        logger.warning("email.fallback_to_smtp %s", log_context)
    return _send_via_django(to_email, subject, html, text)


def real_delivery_available():
    """False when the only "delivery" would be Django's console backend
    (prints the email to the server log) — used where showing success
    without a real email would mislead, like checkout OTP. Locmem (tests) and
    any real backend count as available; ALLOW_CONSOLE_EMAIL_OTP opts a
    developer into console output deliberately."""
    if settings.BREVO_API_KEY or smtp_configured():
        return True
    if settings.EMAIL_BACKEND == "django.core.mail.backends.console.EmailBackend":
        return bool(getattr(settings, "ALLOW_CONSOLE_EMAIL_OTP", False))
    return True


def _send(user, subject, html, text):
    return send_email(user.email, subject, html, text, f"purpose=welcome user_id={user.pk}")


def deliver_welcome_email(onboarding_id, raw_password):
    """Sends the welcome/credentials email with retries and records the
    outcome on CustomerOnboarding. Never raises, never logs the password."""
    onboarding = CustomerOnboarding.objects.select_related("user", "source_order").filter(pk=onboarding_id).first()
    if onboarding is None:
        return False
    user = onboarding.user
    html, text = _render_welcome(user, raw_password, onboarding.source_order)
    delays = (0, *EMAIL_RETRY_DELAYS_SECONDS)
    for attempt, delay in enumerate(delays, start=1):
        if delay and not getattr(settings, "ONBOARDING_EMAIL_SYNC", False):
            time.sleep(delay)
        try:
            ok = _send(user, WELCOME_SUBJECT, html, text)
            error_text = "" if ok else "Email provider rejected the message"
        except Exception as exc:  # noqa: BLE001 — recorded, never propagated
            ok, error_text = False, type(exc).__name__
        CustomerOnboarding.objects.filter(pk=onboarding.pk).update(email_attempts=onboarding.email_attempts + attempt)
        if ok:
            CustomerOnboarding.objects.filter(pk=onboarding.pk).update(
                email_status=CustomerOnboarding.EmailStatus.SENT, email_sent_at=timezone.now(), email_last_error=""
            )
            logger.info("onboarding.email_sent user_id=%s attempt=%s", user.pk, attempt)
            return True
        logger.warning("onboarding.email_failed user_id=%s attempt=%s reason=%s", user.pk, attempt, error_text)
    CustomerOnboarding.objects.filter(pk=onboarding.pk).update(
        email_status=CustomerOnboarding.EmailStatus.FAILED, email_last_error=error_text[:255]
    )
    return False


def dispatch_welcome_email(onboarding_id, raw_password, *, sync=False):
    """Runs deliver_welcome_email after the current transaction commits —
    in a background thread normally, inline when ONBOARDING_EMAIL_SYNC is
    set (tests). The payment/order response never waits on email."""

    def run():
        try:
            deliver_welcome_email(onboarding_id, raw_password)
        finally:
            connection.close()

    def start():
        if sync or getattr(settings, "ONBOARDING_EMAIL_SYNC", False):
            deliver_welcome_email(onboarding_id, raw_password)
        else:
            threading.Thread(target=run, daemon=True).start()

    transaction.on_commit(start)


def reissue_and_send(user, *, sync=False):
    """New temporary password + welcome email for an account still waiting
    for its first password setup (email failed, lost, or expired). Returns
    False — and changes nothing — for an account that already set its own
    password."""
    if not user.must_change_password:
        return False
    onboarding, _ = CustomerOnboarding.objects.get_or_create(user=user)
    with transaction.atomic():
        raw = issue_temporary_password(user)
        dispatch_welcome_email(onboarding.pk, raw, sync=sync)
    return True
