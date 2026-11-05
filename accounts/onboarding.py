"""Customer accounts for orders placed through the guest checkout.

Order of events:

1. Payment succeeds (payments.services.fulfill) -> provision_customer().
   * New email: a CUSTOMER account is created *pending activation* — no
     usable password, `must_change_password` set, profile (and with it the
     unique username) created. Nothing is emailed about the account yet.
   * Existing email: the order is attached to that account; nothing about
     the account changes.
2. An admin moves the order to Processing (admin_api.orders) ->
   start_activation_for_order(). Only for an account still pending
   activation, and only the first time: a single-use, expiring set-password
   link is issued (only its hash is stored, accounts.models.EmailOTP) and
   emailed with the username. Saving Processing again sends nothing.
3. The customer opens the link, sets their own password
   (accounts.views.AccountActivationCompleteView) and can then log in.

Never emails a password. A failed or lost email is recovered with
reissue_and_send() (admin "Resend activation email"), which issues a new
link and retires the old one. Every attempt and error is recorded on
CustomerOnboarding; email failures never touch the order.
"""

import logging
import threading
import time

from django.conf import settings
from django.db import connection, transaction
from django.template.loader import render_to_string
from django.utils import timezone

from .models import CustomerOnboarding, EmailOTP, User

logger = logging.getLogger("accounts.onboarding")

# Delays before each retry of a failed activation-email send.
EMAIL_RETRY_DELAYS_SECONDS = (2, 10)

ACTIVATION_SUBJECT = "Your VR's Gateway Customer Account Is Ready!"


def normalize_email(email):
    return (email or "").strip().lower()


def find_customer_by_email(email):
    return User.objects.filter(email__iexact=normalize_email(email)).first()


def provision_customer(*, email, full_name, phone):
    """Returns (user, created). A new account is pending activation (no
    usable password). An existing account is returned unchanged. Must run
    inside the caller's transaction (payments.services.fulfill)."""
    email = normalize_email(email)
    existing = find_customer_by_email(email)
    if existing is not None:
        return existing, False

    user = User.objects.create_user(
        email=email,
        password=None,  # unusable until the customer sets their own
        full_name=full_name.strip(),
        phone=phone.strip(),
        role=User.Role.CUSTOMER,
        is_active=True,
        # The checkout proved this inbox with an emailed OTP.
        email_verified=True,
        must_change_password=True,
    )
    CustomerOnboarding.objects.create(user=user)
    # Creates the profile and its unique username (the login username).
    from profiles.models import Profile

    Profile.ensure_for_user(user)
    logger.info("onboarding.account_created user_id=%s", user.pk)
    return user, True


def username_for(user):
    from profiles.models import Profile

    return Profile.ensure_for_user(user).username


def _activation_url(raw_token):
    return f"{settings.FRONTEND_URL.rstrip('/')}/set-password?token={raw_token}"


def _render_activation(user, raw_token, order):
    name = user.full_name or user.email
    hours = settings.ACCOUNT_ACTIVATION_LINK_HOURS
    context = {
        # accounts/emails/base.html's layout fields
        "subject": ACTIVATION_SUBJECT,
        "heading": "Your customer account is ready!",
        "name": name,
        "action_url": _activation_url(raw_token),
        "action_label": "Set Your Password",
        "expires_text": f"{hours} hours" if hours != 1 else "1 hour",
        # this email's own fields
        "customer_name": name,
        "username": username_for(user),
        "order_number": order.order_number if order is not None else "",
    }
    return (
        render_to_string("accounts/emails/account_activation.html", context),
        render_to_string("accounts/emails/account_activation.txt", context),
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
    return send_email(user.email, subject, html, text, f"purpose=activation user_id={user.pk}")


def deliver_activation_email(onboarding_id, raw_token):
    """Sends the activation email with retries and records every attempt on
    CustomerOnboarding. Never raises, never logs the link."""
    onboarding = CustomerOnboarding.objects.select_related("user", "source_order").filter(pk=onboarding_id).first()
    if onboarding is None:
        return False
    user = onboarding.user
    try:
        html, text = _render_activation(user, raw_token, onboarding.source_order)
    except Exception as exc:  # noqa: BLE001 — recorded, never propagated
        error_text = type(exc).__name__
        CustomerOnboarding.objects.filter(pk=onboarding.pk).update(
            email_status=CustomerOnboarding.EmailStatus.FAILED,
            email_last_error=error_text[:255],
        )
        logger.warning("onboarding.email_failed user_id=%s reason=%s", user.pk, error_text)
        return False
    delays = (0, *EMAIL_RETRY_DELAYS_SECONDS)
    error_text = ""
    for attempt, delay in enumerate(delays, start=1):
        if delay and not getattr(settings, "ONBOARDING_EMAIL_SYNC", False):
            time.sleep(delay)
        try:
            ok = _send(user, ACTIVATION_SUBJECT, html, text)
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


def dispatch_activation_email(onboarding_id, raw_token, *, sync=False):
    """Runs deliver_activation_email after the current transaction commits —
    in a background thread normally, inline when ONBOARDING_EMAIL_SYNC is
    set (tests). The admin's request never waits on email."""

    def run():
        try:
            deliver_activation_email(onboarding_id, raw_token)
        finally:
            connection.close()

    def start():
        if sync or getattr(settings, "ONBOARDING_EMAIL_SYNC", False):
            deliver_activation_email(onboarding_id, raw_token)
        else:
            threading.Thread(target=run, daemon=True).start()

    transaction.on_commit(start, robust=True)


def _issue_and_dispatch(onboarding, *, sync=False):
    raw_token = EmailOTP.issue_activation_link(onboarding.user, settings.ACCOUNT_ACTIVATION_LINK_HOURS)
    CustomerOnboarding.objects.filter(pk=onboarding.pk).update(
        credentials_issued_at=timezone.now(),
        email_status=CustomerOnboarding.EmailStatus.PENDING,
        email_last_error="",
    )
    dispatch_activation_email(onboarding.pk, raw_token, sync=sync)


def _start_activation_for_user(user, *, order, sync=False):
    if not user.must_change_password:
        return "active"
    with transaction.atomic():
        onboarding, _ = CustomerOnboarding.objects.select_for_update().get_or_create(user=user)
        if onboarding.credentials_issued_at is not None:
            return "already_sent"
        if onboarding.source_order_id is None:
            onboarding.source_order = order
            onboarding.save(update_fields=["source_order"])
        _issue_and_dispatch(onboarding, sync=sync)
    logger.info("onboarding.activation_started user_id=%s order=%s", user.pk, order.pk)
    return "sent"


def start_activation_for_order(order, *, sync=False):
    """Called when an admin moves a paid order to Processing. Returns what
    happened: "sent" (link issued and email queued), "already_sent" (this
    account's activation was already started — nothing sent again),
    "active" (an existing, activated account — nothing to send; its
    password is never touched) or "no_onboarding"."""
    recipients = list(order.recipients.select_related("user").all())
    if recipients:
        statuses = []
        for recipient in recipients:
            if recipient.user_id is None:
                logger.error(
                    "onboarding.activation_start_failed recipient_id=%s order_id=%s reason=missing_user",
                    recipient.pk,
                    order.pk,
                )
                statuses.append("failed")
                continue
            try:
                statuses.append(_start_activation_for_user(recipient.user, order=order, sync=sync))
            except Exception as exc:  # noqa: BLE001 — one recipient must not block the rest
                logger.error(
                    "onboarding.activation_start_failed recipient_id=%s user_id=%s order_id=%s reason=%s",
                    recipient.pk,
                    recipient.user_id,
                    order.pk,
                    type(exc).__name__,
                )
                statuses.append("failed")
        if not statuses:
            return "no_onboarding"
        if "failed" in statuses:
            return "failed" if all(status == "failed" for status in statuses) else "partial_failure"
        if "sent" in statuses:
            return "sent"
        if "already_sent" in statuses:
            return "already_sent"
        if "active" in statuses:
            return "active"
        return "no_onboarding"

    return _start_activation_for_user(order.customer, order=order, sync=sync)


def reissue_and_send(user, *, sync=False):
    """Admin "Resend activation email": a fresh link (the old one stops
    working) for an account still pending activation. Returns False — and
    changes nothing — for an account that already set its password."""
    if not user.must_change_password:
        return False
    with transaction.atomic():
        onboarding, _ = CustomerOnboarding.objects.select_for_update().get_or_create(user=user)
        _issue_and_dispatch(onboarding, sync=sync)
    return True
