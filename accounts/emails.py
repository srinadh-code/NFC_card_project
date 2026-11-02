import logging
from urllib.parse import quote

import requests
from django.conf import settings
from django.core.mail import get_connection, send_mail
from django.template.loader import render_to_string


def _email_connection_and_sender():
    """Admin-configured SMTP host/port/from-address (Settings > Email)
    override the server's env-configured defaults for real, live-sent mail
    when set — auth credentials stay env-only (EMAIL_HOST_USER/PASSWORD),
    same "no credential in an admin-editable row" rule as Payment Settings.
    Returns (connection, from_email); connection is None to mean "use
    Django's default backend/settings" when nothing has been configured."""
    from website_content.models import EmailSettings

    email_settings = EmailSettings.objects.first()
    if email_settings is None or not email_settings.smtp_host:
        return None, settings.DEFAULT_FROM_EMAIL

    # EMAIL_HOST_USER/PASSWORD/USE_TLS only exist on `settings` at all when
    # EMAIL_HOST was set at process start (see config/settings.py) — getattr
    # with a default avoids an AttributeError when only the DB-configured
    # host is being used without any env SMTP config present.
    connection = get_connection(
        backend="django.core.mail.backends.smtp.EmailBackend",
        host=email_settings.smtp_host,
        port=email_settings.smtp_port or 587,
        username=getattr(settings, "EMAIL_HOST_USER", ""),
        password=getattr(settings, "EMAIL_HOST_PASSWORD", ""),
        use_tls=getattr(settings, "EMAIL_USE_TLS", True),
    )
    from_email = email_settings.from_address or settings.DEFAULT_FROM_EMAIL
    return connection, from_email

logger = logging.getLogger("accounts.email")


def send_order_confirmation_email(user, order):
    """Order confirmation — the one place a Track Order link is ever
    emailed. Sent through Django's mail path (admin-configured SMTP from
    Settings > Email when set, console backend locally otherwise) rather
    than Brevo. The link embeds order.tracking_token — the same secure,
    backend-generated credential PublicOrderTrackingView requires (see
    orders/models.py) — so the customer never sees or has to handle the
    token itself, only a clickable link. Never raises: this fires
    synchronously from orders/signals.py inside the same request/transaction
    that creates the order, and a mail failure must never block placing it.
    """
    order_number = f"ORD{order.pk:06d}"
    tracking_link = f"{settings.FRONTEND_URL}/track-order?order={order_number}&token={order.tracking_token}"
    greeting = user.full_name or user.email

    connection, from_email = _email_connection_and_sender()
    try:
        send_mail(
            subject=f"Your VR's GATEWAY order {order_number} is confirmed",
            message=(
                f"Hi {greeting},\n\n"
                f"Thanks for your order — {order_number} has been placed.\n\n"
                f"Track your order:\n{tracking_link}\n\n"
                "This link is private to your order — please don't share it."
            ),
            from_email=from_email,
            recipient_list=[user.email],
            fail_silently=False,
            connection=connection,
            html_message=(
                f"<p>Hi {greeting},</p>"
                f"<p>Thanks for your order — <strong>{order_number}</strong> has been placed.</p>"
                f'<p><a href="{tracking_link}">Track Your Order</a></p>'
                "<p>This link is private to your order — please don't share it.</p>"
            ),
        )
        return True
    except Exception:
        logger.exception("email.order_confirmation.send_failed order_id=%s", order.pk)
        return False


BREVO_API_URL = "https://api.brevo.com/v3/smtp/email"
BREVO_TIMEOUT_SECONDS = 10


def _frontend_link(path, token):
    """Absolute frontend URL carrying `token`, or None if FRONTEND_URL isn't
    HTTPS in production — a credential-bearing link must never be emailed
    over plain HTTP."""
    base = settings.FRONTEND_URL.rstrip("/")
    if settings.DJANGO_ENV == "production" and not base.startswith("https://"):
        logger.error("email.link.insecure_frontend_url — FRONTEND_URL must start with https:// in production")
        return None
    return f"{base}{path}?token={quote(token, safe='')}"


def _expires_text(minutes):
    if minutes % 60 == 0:
        hours = minutes // 60
        return f"{hours} hour{'s' if hours != 1 else ''}"
    return f"{minutes} minutes"


def send_brevo_email(to_email, subject, html_content, text_content, log_context):
    """
    The one place that talks to Brevo's transactional-email HTTP API — used
    instead of Django's EMAIL_BACKEND/SMTP because Render blocks outbound
    SMTP ports on free instances while HTTPS always works. Returns True only
    if Brevo accepted the message (2xx); never raises. Reads nothing but
    BREVO_API_KEY/BREVO_SENDER_EMAIL/BREVO_SENDER_NAME from settings, so
    switching keys or providers is purely a configuration change.

    Logs only structural outcomes — the status code and Brevo's own error
    code/message — never the API key, the recipient's link/token, or the
    email body.
    """
    if not settings.BREVO_API_KEY:
        logger.warning("email.brevo.not_configured %s — set BREVO_API_KEY to enable delivery", log_context)
        return False

    sender = {"email": settings.BREVO_SENDER_EMAIL}
    if settings.BREVO_SENDER_NAME:
        sender["name"] = settings.BREVO_SENDER_NAME

    try:
        response = requests.post(
            BREVO_API_URL,
            headers={
                "api-key": settings.BREVO_API_KEY,
                "Content-Type": "application/json",
                "accept": "application/json",
            },
            json={
                "sender": sender,
                "to": [{"email": to_email}],
                "subject": subject,
                "htmlContent": html_content,
                "textContent": text_content,
            },
            timeout=BREVO_TIMEOUT_SECONDS,
        )
    except requests.Timeout:
        logger.error("email.brevo.timeout %s after=%ss", log_context, BREVO_TIMEOUT_SECONDS)
        return False
    except requests.RequestException as exc:
        logger.error("email.brevo.request_failed %s error=%s", log_context, type(exc).__name__)
        return False

    if not 200 <= response.status_code < 300:
        try:
            detail = response.json()
            brevo_code, brevo_message = detail.get("code", ""), detail.get("message", "")
        except ValueError:
            brevo_code, brevo_message = "", ""
        logger.error(
            "email.brevo.rejected %s status=%s code=%s message=%s",
            log_context,
            response.status_code,
            brevo_code,
            brevo_message[:200],
        )
        return False

    logger.info("email.brevo.sent %s", log_context)
    return True


def _send_link_email(user, *, template, subject, heading, action_label, path, token, lifetime_minutes, log_context):
    link = _frontend_link(path, token)
    if link is None:
        return False
    context = {
        "subject": subject,
        "heading": heading,
        "name": user.full_name or user.email,
        "action_url": link,
        "action_label": action_label,
        "expires_text": _expires_text(lifetime_minutes),
    }
    return send_brevo_email(
        user.email,
        subject,
        render_to_string(f"accounts/emails/{template}.html", context),
        render_to_string(f"accounts/emails/{template}.txt", context),
        log_context,
    )


def send_verification_email(user, raw_token):
    """Emails the account-verification link (frontend /verify-email page).
    `raw_token` comes straight from EmailOTP.issue_verification_link() —
    only its hash is stored, so it can't be re-read later."""
    from .models import EmailOTP

    return _send_link_email(
        user,
        template="verify_email",
        subject="Verify your VR's GATEWAY email address",
        heading="Confirm your email address",
        action_label="Verify Email",
        path="/verify-email",
        token=raw_token,
        lifetime_minutes=EmailOTP.VERIFY_LINK_LIFETIME_MINUTES,
        log_context=f"purpose=verify_email user_id={user.id}",
    )


def send_password_reset_otp_email(user, raw_code, lifetime_minutes):
    """Emails the 6-digit password-reset code. `raw_code` comes straight
    from EmailOTP.issue() — only its hash is stored. Callers must not let
    the result change the forgot-password response, which stays identical
    whether or not the account exists."""
    subject = "Your VR's GATEWAY password reset code"
    context = {
        "subject": subject,
        "heading": "Reset your password",
        "name": user.full_name or user.email,
        "code": raw_code,
        "expires_text": _expires_text(lifetime_minutes),
    }
    return send_brevo_email(
        user.email,
        subject,
        render_to_string("accounts/emails/reset_password_otp.html", context),
        render_to_string("accounts/emails/reset_password_otp.txt", context),
        f"purpose=reset_password_otp user_id={user.id}",
    )
