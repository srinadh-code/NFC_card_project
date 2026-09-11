import logging

import requests
from django.conf import settings
from django.core.mail import send_mail

logger = logging.getLogger("accounts.email")


def send_registration_otp_email(user, raw_code):
    """Registration email-verification OTP, sent through Django's configured
    EMAIL_BACKEND (console backend locally, real SMTP once EMAIL_HOST is
    set). `raw_code` is the plaintext OTP returned by EmailOTP.issue() — it
    is never persisted (only its hash is, on `otp.code_hash`), so callers
    must pass it through directly rather than reading it back off the row."""
    send_mail(
        subject="Verify your VR's NEXORA account",
        message=(
            f"Hi {user.full_name or user.email},\n\n"
            f"Your verification code is: {raw_code}\n"
            f"This code expires in 10 minutes.\n\n"
            "If you didn't request this, you can ignore this email."
        ),
        from_email=settings.DEFAULT_FROM_EMAIL,
        recipient_list=[user.email],
        fail_silently=False,
    )


BREVO_API_URL = "https://api.brevo.com/v3/smtp/email"


def send_password_reset_otp_email(user, raw_code, lifetime_minutes):
    """
    Sends the forgot-password OTP to the account's own registered email via
    Brevo's transactional-email HTTP API — deliberately not Django's
    EMAIL_BACKEND/SMTP settings, since hosts like Render commonly block
    outbound SMTP ports while plain HTTPS is always available. Returns True
    if Brevo accepted the send, False otherwise (never raises) — callers
    must not let delivery status leak into the forgot-password response,
    which stays identical either way to avoid revealing account existence.

    Provider-independent by design: this function is the ONLY place that
    knows Brevo exists. It reads nothing but BREVO_API_KEY/BREVO_SENDER_EMAIL/
    BREVO_SENDER_NAME from settings (sourced from the environment) — a
    personal development key today, a company-owned key later, or a
    different provider's implementation entirely — none of that requires
    touching accounts/views.py or the OTP/reset-token logic that calls this.

    Never logs the OTP code itself, only structural outcomes.
    """
    if not settings.BREVO_API_KEY:
        logger.warning(
            "email.reset_otp.provider_not_configured user_id=%s — set BREVO_API_KEY to enable delivery", user.id
        )
        return False

    body = (
        f"Hi {user.full_name or user.email},\n\n"
        f"Your password reset code is: {raw_code}\n"
        f"This code expires in {lifetime_minutes} minutes. Do not share this code with anyone.\n\n"
        "If you didn't request this, you can ignore this email."
    )

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
                "to": [{"email": user.email}],
                "subject": "Reset your VR's NEXORA password",
                "textContent": body,
            },
            timeout=10,
        )
        response.raise_for_status()
        return True
    except requests.RequestException:
        # Covers connection errors, timeouts, and non-2xx status (including
        # Brevo rate-limiting/auth failures via raise_for_status()) — never
        # raises out of this function, and never logs the response body,
        # which could echo back the request payload (containing the OTP).
        logger.exception("email.reset_otp.send_failed user_id=%s", user.id)
        return False
