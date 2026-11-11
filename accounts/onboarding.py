"""Customer accounts for orders placed through the guest checkout.

Order of events:

1. Payment succeeds (payments.services.fulfill) -> provision_customer().
   * New email: a CUSTOMER account is created *pending activation* — no
     usable password and `must_change_password` set. Only recipients get a
     profile. Purchaser-only accounts get a separate setup link after commit.
   * Existing email: the order is attached to that account; nothing about
     the account changes.
2. An admin moves the order to Processing (admin_api.orders) ->
   start_activation_for_order(). Only for a recipient account still pending
   activation, and only the first time: a single-use, expiring set-password
   link is issued (only its hash is stored, accounts.models.EmailOTP) and
   emailed with the username. Saving Processing again sends nothing.
3. The purchaser or recipient opens their purpose-specific link, sets a password
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
from django.db import IntegrityError, connection, transaction
from django.template.loader import render_to_string
from django.utils import timezone

from .models import CustomerOnboarding, EmailOTP, User

logger = logging.getLogger("accounts.onboarding")

# Delays before each retry of a failed activation-email send.
EMAIL_RETRY_DELAYS_SECONDS = (2, 10)

ACTIVATION_SUBJECT = "Your VR's Gateway Customer Account Is Ready!"
CARD_READY_SUBJECT = "Your VR's Gateway Card Is Ready"


def normalize_email(email):
    return (email or "").strip().lower()


def find_customer_by_email(email):
    return User.objects.filter(email__iexact=normalize_email(email)).first()


def provision_customer(*, email, full_name, phone, create_profile=True, email_verified=False):
    """Returns (user, created). A new account is pending activation (no
    usable password). An existing account is returned unchanged. Must run
    inside the caller's transaction (payments.services.fulfill)."""
    email = normalize_email(email)
    existing = find_customer_by_email(email)
    if existing is not None:
        return existing, False

    try:
        with transaction.atomic():
            user = User.objects.create_user(
                email=email,
                password=None,
                full_name=full_name.strip(),
                phone=phone.strip(),
                role=User.Role.CUSTOMER,
                is_active=True,
                email_verified=email_verified,
                must_change_password=True,
            )
            CustomerOnboarding.objects.create(user=user)
            if create_profile:
                from profiles.models import Profile
                Profile.ensure_for_user(user)
    except IntegrityError:
        existing = find_customer_by_email(email)
        if existing is None:
            raise
        return existing, False
    logger.info("onboarding.account_created user_id=%s", user.pk)
    return user, True


def ensure_recipient_accounts(order):
    """Link each paid allocation to one reusable account/profile.

    Checkout snapshots never overwrite an existing person's contact details,
    password or profile. Each allocation is retained even for repeated emails.
    """
    from profiles.models import Profile

    for recipient in sorted(order.recipients.all(), key=lambda r: normalize_email(r.email)):
        user = recipient.user
        if user is None:
            user, _ = provision_customer(email=recipient.email, full_name=recipient.name, phone=recipient.phone or "")
        profile = Profile.ensure_for_user(user)
        recipient.user = user
        recipient.profile = profile
        recipient.save(update_fields=["user", "profile", "updated_at"])
        CustomerOnboarding.objects.filter(user=user, source_order__isnull=True).update(source_order=order)


def eligible_activation_recipients():
    """Paid order allocations, the authority for recipient account emails.

    Owning or paying for an order alone never makes an account eligible.
    Keep purchaser onboarding audit records without treating them as invites.
    """
    from orders.models import Order, OrderRecipient

    return OrderRecipient.objects.filter(order__payment_status=Order.PaymentStatus.PAID, user__isnull=False)


def username_for(user):
    # A purchaser can log in with email without owning a digital profile.
    # Rendering account-setup emails or checking tokens must not create one.
    from profiles.models import Profile
    return Profile.objects.filter(user=user).values_list("username", flat=True).first() or user.email


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
        "is_recipient": user.order_recipients.exists() or user.nfc_cards.exists(),
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
    rejection status and recognized error code for diagnosis."""
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
    if not user.must_change_password or not eligible_activation_recipients().filter(user=user).exists():
        return False
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


def _dispatch_after_commit(deliver, *args, sync=False):
    """Runs account email delivery after the current transaction commits —
    in a background thread normally, inline when ONBOARDING_EMAIL_SYNC is
    set (tests). The request never waits on email."""

    def invoke():
        try:
            deliver(*args)
        except Exception as exc:
            # Credentials may occur in an email provider's exception text.
            # Report only the class, including failures before rendering.
            logger.warning("onboarding.email_dispatch_failed reason=%s", type(exc).__name__)

    def run():
        try:
            invoke()
        finally:
            connection.close()

    def start():
        try:
            if sync or getattr(settings, "ONBOARDING_EMAIL_SYNC", False):
                invoke()
            else:
                threading.Thread(target=run, daemon=True).start()
        except Exception as exc:
            logger.warning("onboarding.email_dispatch_failed reason=%s", type(exc).__name__)

    transaction.on_commit(start, robust=True)


def dispatch_activation_email(onboarding_id, raw_token, *, sync=False):
    _dispatch_after_commit(deliver_activation_email, onboarding_id, raw_token, sync=sync)


def _issue_and_dispatch(onboarding, *, sync=False):
    raw_token = EmailOTP.issue_activation_link(onboarding.user, settings.ACCOUNT_ACTIVATION_LINK_HOURS)
    CustomerOnboarding.objects.filter(pk=onboarding.pk).update(
        credentials_issued_at=timezone.now(),
        email_status=CustomerOnboarding.EmailStatus.PENDING,
        email_last_error="",
    )
    dispatch_activation_email(onboarding.pk, raw_token, sync=sync)


def _start_activation_for_user(user, *, order, sync=False):
    with transaction.atomic():
        # Re-read activation state under a lock: completing setup while an
        # admin starts Processing cannot issue a fresh link for an active user.
        user = User.objects.select_for_update().get(pk=user.pk)
        if not user.must_change_password:
            return "active"
        onboarding, _ = CustomerOnboarding.objects.select_for_update().get_or_create(user=user)
        if onboarding.credentials_issued_at is not None:
            return "already_sent"
        if onboarding.source_order_id is None:
            onboarding.source_order = order
            onboarding.save(update_fields=["source_order"])
        _issue_and_dispatch(onboarding, sync=sync)
    logger.info("onboarding.activation_started user_id=%s order=%s", user.pk, order.pk)
    return "sent"


def _render_card_ready(user, order):
    name = user.full_name or user.email
    context = {
        # accounts/emails/base.html's layout fields. No action_url: base.html
        # would describe it as a single-use expiring link, and this email
        # carries no credential at all — just the normal login page.
        "subject": CARD_READY_SUBJECT,
        "heading": "Your NFC card is ready",
        "name": name,
        # this email's own fields
        "customer_name": name,
        "login_email": user.email,
        "login_url": f"{settings.FRONTEND_URL.rstrip('/')}/login",
        "order_number": order.order_number if order is not None else "",
    }
    return (
        render_to_string("accounts/emails/card_ready.html", context),
        render_to_string("accounts/emails/card_ready.txt", context),
    )


def deliver_card_ready_email(recipient_id):
    """Tells an already-activated account (e.g. a purchaser who has set their
    password and now bought a card for themselves) that a card is allocated
    to it and its Customer Dashboard is available. Contains no password or
    token — the existing password is never reset. Retries like the
    activation email; the outcome is recorded on the OrderRecipient row.
    Never raises."""
    from orders.models import OrderRecipient

    allocation = OrderRecipient.objects.select_related("user", "order").filter(pk=recipient_id).first()
    if allocation is None or allocation.user is None or allocation.user.must_change_password:
        return False
    user = allocation.user
    error_text = ""
    try:
        html, text = _render_card_ready(user, allocation.order)
    except Exception as exc:  # noqa: BLE001 — recorded, never propagated
        html = text = None
        error_text = type(exc).__name__
    if html is not None:
        for attempt, delay in enumerate((0, *EMAIL_RETRY_DELAYS_SECONDS), start=1):
            if delay and not getattr(settings, "ONBOARDING_EMAIL_SYNC", False):
                time.sleep(delay)
            try:
                ok = send_email(user.email, CARD_READY_SUBJECT, html, text, f"purpose=card_ready user_id={user.pk}")
                error_text = "" if ok else "Email provider rejected the message"
            except Exception as exc:  # noqa: BLE001 — recorded, never propagated
                ok, error_text = False, type(exc).__name__
            if ok:
                OrderRecipient.objects.filter(pk=allocation.pk).update(
                    invitation_status=OrderRecipient.InvitationStatus.SENT, invitation_sent_at=timezone.now()
                )
                logger.info("onboarding.card_ready_sent user_id=%s order_id=%s attempt=%s", user.pk, allocation.order_id, attempt)
                return True
    # Clearing the claim lets a later move into Processing retry it.
    OrderRecipient.objects.filter(pk=allocation.pk).update(
        invitation_status=OrderRecipient.InvitationStatus.FAILED, invitation_sent_at=None
    )
    logger.warning("onboarding.card_ready_failed user_id=%s order_id=%s reason=%s", user.pk, allocation.order_id, error_text)
    return False


def _notify_card_ready(user, *, order, sync=False):
    """An already-activated account gained a card on this order: send one
    card-ready email (no credentials) per allocation, claimed under a row
    lock so a repeated status change can't send it twice."""
    from orders.models import OrderRecipient

    with transaction.atomic():
        claimable = list(
            OrderRecipient.objects.select_for_update()
            .filter(order=order, user=user, invitation_sent_at__isnull=True)
            .values_list("pk", flat=True)
        )
        if not claimable:
            return
        OrderRecipient.objects.filter(pk__in=claimable).update(
            invitation_status=OrderRecipient.InvitationStatus.PENDING, invitation_sent_at=timezone.now()
        )
        # One email per account per order, even for several allocations.
        _dispatch_after_commit(deliver_card_ready_email, claimable[0], sync=sync)


def start_activation_for_order(order, *, sync=False):
    """Called when an admin moves a paid order to Processing. Returns what
    happened: "sent" (link issued and email queued), "already_sent" (this
    account's activation was already started — nothing sent again),
    "active" (an existing, activated account — its password is never
    touched; it gets a one-time card-ready email with a login link instead
    of a set-password link) or "no_onboarding"."""
    if order.payment_status != order.PaymentStatus.PAID:
        return "no_onboarding"
    ensure_recipient_accounts(order)
    # Deduplicate accounts across allocations; include the purchaser only
    # through an explicit recipient allocation on this paid order.
    users = {r.user_id: r.user for r in eligible_activation_recipients().filter(order=order).select_related("user")}
    statuses = []
    for user in sorted(users.values(), key=lambda u: normalize_email(u.email)):
        try:
            status = _start_activation_for_user(user, order=order, sync=sync)
            if status == "active":
                # Already has a password (e.g. a purchaser who set one up and
                # now bought a card for themselves): no activation is needed,
                # but they must still learn their Customer Dashboard is ready.
                _notify_card_ready(user, order=order, sync=sync)
            statuses.append(status)
        except Exception as exc:
            logger.error("onboarding.activation_start_failed user_id=%s order_id=%s reason=%s", user.pk, order.pk, type(exc).__name__)
            statuses.append("failed")
    if "failed" in statuses:
        return "failed" if all(s == "failed" for s in statuses) else "partial_failure"
    for status in ("sent", "already_sent", "active"):
        if status in statuses:
            return status
    return "no_onboarding"


def reissue_and_send(user, *, sync=False):
    """Admin "Resend activation email": a fresh link (the old one stops
    working) for an account still pending activation. Returns False — and
    changes nothing — for activated accounts, purchaser-only accounts or
    recipients whose activation has not started yet."""
    with transaction.atomic():
        user = User.objects.select_for_update().get(pk=user.pk)
        if not user.must_change_password or not eligible_activation_recipients().filter(user=user).exists():
            return False
        onboarding = CustomerOnboarding.objects.select_for_update().filter(user=user).first()
        if onboarding is None or onboarding.credentials_issued_at is None:
            return False
        _issue_and_dispatch(onboarding, sync=sync)
    return True


def purchaser_setup_eligible(user):
    """Only paid order owners without a recipient identity may use this purpose.

    Recovery does not trust a historical email_verified flag: a fresh link
    delivered to the current inbox is the proof required to finish setup.
    """
    from django.db.models import Q
    from orders.models import Order

    if not user.is_active or user.role != User.Role.CUSTOMER or not user.must_change_password:
        return False
    # This also invalidates an outstanding purchaser link immediately when
    # that buyer later becomes a recipient, without locking credential rows
    # during recipient provisioning. Only the recipient path can then be used.
    if user.order_recipients.exists() or user.nfc_cards.exists():
        return False
    return user.orders.filter(payment_status=Order.PaymentStatus.PAID).filter(
        Q(purchaser_email__iexact=user.email) | Q(purchaser_email=""),
    ).exists()


def purchaser_setup_state(user):
    if not user.must_change_password:
        return "active"
    return "required" if purchaser_setup_eligible(user) else "recipient"


def deliver_purchaser_setup_email(user_id, raw_token):
    """Reuse Brevo/SMTP delivery after commit; never log setup credentials."""
    from .emails import _frontend_link

    user = User.objects.filter(pk=user_id).first()
    if user is None or not purchaser_setup_eligible(user):
        return False
    outcome, _ = EmailOTP.check_activation_link(raw_token, purpose=EmailOTP.Purpose.PURCHASER)
    if outcome != EmailOTP.LINK_VALID:
        return False
    # Console delivery would write the credential to logs. Unlike checkout
    # OTP development overrides, purchaser links must never use that backend.
    if (
        not settings.BREVO_API_KEY
        and not smtp_configured()
        and settings.EMAIL_BACKEND == "django.core.mail.backends.console.EmailBackend"
    ):
        logger.warning("purchaser.setup.delivery_unavailable user_id=%s", user.pk)
        return False
    link = _frontend_link("/set-password", raw_token)
    if link is None:
        return False
    context = {
        "subject": "Set Up Your VR's Gateway Account",
        "heading": "Set up your purchaser account",
        "name": user.full_name or user.email,
        "action_url": f"{link}&purpose=purchaser",
        "action_label": "Set Your Password",
        "expires_text": "1 hour",
    }
    try:
        html = render_to_string("accounts/emails/purchaser_setup.html", context)
        text = render_to_string("accounts/emails/purchaser_setup.txt", context)
    except Exception as exc:
        logger.warning("purchaser.setup.email_failed user_id=%s reason=%s", user.pk, type(exc).__name__)
        return False
    for attempt, delay in enumerate((0, *EMAIL_RETRY_DELAYS_SECONDS), start=1):
        if delay and not getattr(settings, "ONBOARDING_EMAIL_SYNC", False):
            time.sleep(delay)
        try:
            delivered = send_email(user.email, context["subject"], html, text, f"purpose=purchaser_setup user_id={user.pk}")
        except Exception as exc:
            delivered = False
            logger.warning("purchaser.setup.email_failed user_id=%s reason=%s", user.pk, type(exc).__name__)
        if delivered:
            logger.info("purchaser.setup.email_sent user_id=%s attempt=%s", user.pk, attempt)
            return True
    logger.warning("purchaser.setup.email_failed user_id=%s", user.pk)
    return False


def start_purchaser_setup(order, session, *, sync=False):
    """Schedule the first buyer-only setup exactly once after a verified payment."""
    if (
        order.payment_status != order.PaymentStatus.PAID
        or session.status != session.Status.FULFILLED
        or session.order_id != order.pk
        or not session.email_verified
        or normalize_email(session.email) != normalize_email(order.customer.email)
    ):
        return False
    return _issue_purchaser_setup(order.customer_id, reissue=False, sync=sync)


def _issue_purchaser_setup(user_id, *, reissue, sync=False):
    user = User.objects.filter(pk=user_id).first()
    if user is None or not purchaser_setup_eligible(user):
        return False
    with transaction.atomic():
        # Fulfillment already references this user through foreign keys.
        # PostgreSQL's NO KEY UPDATE serializes setup without conflicting
        # with another paid order's KEY SHARE reference to the same buyer.
        user = User.objects.select_for_update(no_key=True).filter(pk=user_id).first()
        if user is None or not purchaser_setup_eligible(user):
            return False
        # A durable marker, independent of recipient onboarding's audit fields.
        # Even expired/consumed rows stop automatic retries and later payments
        # from sending another setup message. Recovery explicitly reissues.
        if not reissue and user.otps.filter(purpose=EmailOTP.Purpose.PURCHASER).exists():
            return False
        raw_token = EmailOTP.issue_purchaser_setup_link(user)
        _dispatch_after_commit(deliver_purchaser_setup_email, user.pk, raw_token, sync=sync)
    return True


def request_purchaser_setup(email):
    user = find_customer_by_email(email)
    return user is not None and _issue_purchaser_setup(user.pk, reissue=True)
