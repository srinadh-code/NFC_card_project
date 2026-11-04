"""OTP verification of a guest's email / mobile before checkout.

Guests have no account yet, so accounts.EmailOTP (tied to a user) doesn't
fit; this keeps the same rules: 6-digit code from `secrets`, stored only as
an HMAC, valid 5 minutes, single use, max 5 wrong attempts, a resend
cooldown and an hourly send cap per destination. A correct code returns a
verification token (also stored only as a hash, valid 30 minutes) that the
checkout endpoint requires — the backend never trusts a client-side
"verified" flag.
"""

import hashlib
import hmac
import re
import secrets
from datetime import timedelta

from django.conf import settings
from django.template.loader import render_to_string
from django.utils import timezone

from . import sms
from .models import CheckoutVerification

CODE_LIFETIME = timedelta(minutes=5)
TOKEN_LIFETIME = timedelta(minutes=30)
RESEND_COOLDOWN = timedelta(seconds=60)
MAX_SENDS_PER_HOUR = 5
MAX_ATTEMPTS = 5

MOBILE_RE = re.compile(r"^[6-9]\d{9}$")


class VerificationError(Exception):
    def __init__(self, message, *, code="invalid", status=400, retry_after=None):
        super().__init__(message)
        self.message = message
        self.code = code
        self.status = status
        self.retry_after = retry_after


def _digest(value):
    return hmac.new(settings.SECRET_KEY.encode(), value.encode(), hashlib.sha256).hexdigest()


def normalize_destination(channel, destination):
    destination = (destination or "").strip()
    if channel == CheckoutVerification.Channel.EMAIL:
        destination = destination.lower()
        if not re.match(r"^[^@\s]+@[^@\s]+\.[^@\s]+$", destination):
            raise VerificationError("Please enter a valid email address.", code="invalid_destination")
        return destination
    digits = re.sub(r"\D", "", destination)
    if len(digits) == 12 and digits.startswith("91"):
        digits = digits[2:]
    if not MOBILE_RE.match(digits):
        raise VerificationError("Please enter a valid 10-digit mobile number.", code="invalid_destination")
    return digits


DELIVERY_FAILED_MESSAGE = (
    "We couldn't send the verification email right now. Please check the address and try again in a few minutes."
)


def _deliver_email(email, code):
    import logging

    from accounts.onboarding import real_delivery_available, send_email

    if not real_delivery_available():
        # Only the console backend is configured: nothing would reach an
        # inbox, so don't pretend it was sent.
        logging.getLogger("payments.verification").error(
            "checkout_otp.email_not_configured — set a valid BREVO_API_KEY or EMAIL_HOST/EMAIL_HOST_USER/EMAIL_HOST_PASSWORD"
        )
        raise VerificationError(
            "Email verification isn't available right now. Please try again later.", code="email_unavailable", status=503
        )
    subject = "Your VRS GATEWAY Verification Code"
    context = {"code": code, "minutes": int(CODE_LIFETIME.total_seconds() // 60), "subject": subject}
    try:
        ok = send_email(
            email,
            subject,
            render_to_string("payments/emails/checkout_otp.html", context),
            render_to_string("payments/emails/checkout_otp.txt", context),
            "purpose=checkout_otp",
        )
    except Exception as exc:  # SMTP errors — logged by class only, never the code
        logging.getLogger("payments.verification").error("checkout_otp.smtp_failed error=%s", type(exc).__name__)
        ok = False
    if not ok:
        raise VerificationError(DELIVERY_FAILED_MESSAGE, code="delivery_failed", status=502)


def _clean_ref(session_ref):
    return str(session_ref or "").strip()[:64]


def send_code(channel, destination, session_ref=""):
    """Creates a new challenge and delivers its code. Returns seconds until
    another code may be requested."""
    destination = normalize_destination(channel, destination)
    if channel == CheckoutVerification.Channel.SMS and not sms.is_configured():
        raise VerificationError(
            "Mobile verification isn't available right now. Please verify with your email.",
            code="sms_unavailable",
            status=503,
        )
    now = timezone.now()
    recent = CheckoutVerification.objects.filter(channel=channel, destination=destination)
    last = recent.order_by("-created_at").first()
    if last is not None and now - last.created_at < RESEND_COOLDOWN:
        wait = int((RESEND_COOLDOWN - (now - last.created_at)).total_seconds()) + 1
        raise VerificationError(
            f"Please wait {wait} seconds before requesting another code.", code="cooldown", status=429, retry_after=wait
        )
    if recent.filter(created_at__gte=now - timedelta(hours=1)).count() >= MAX_SENDS_PER_HOUR:
        raise VerificationError(
            "Too many codes requested. Please try again later.", code="too_many_requests", status=429, retry_after=3600
        )

    code = f"{secrets.randbelow(1_000_000):06d}"
    # Any earlier unused code for this destination stops working.
    recent.filter(verified_at__isnull=True).update(code_hash="")
    challenge = CheckoutVerification.objects.create(
        channel=channel,
        destination=destination,
        session_ref=_clean_ref(session_ref),
        code_hash=_digest(code),
        expires_at=now + CODE_LIFETIME,
    )
    try:
        if channel == CheckoutVerification.Channel.EMAIL:
            _deliver_email(destination, code)
        else:
            try:
                sms.send_otp(destination, code)
            except (sms.SmsDeliveryError, sms.SmsNotConfigured):
                raise VerificationError("We couldn't send the SMS. Please try again.", code="delivery_failed", status=502)
    except VerificationError:
        challenge.delete()
        raise
    return int(RESEND_COOLDOWN.total_seconds())


def verify_code(channel, destination, code, session_ref=""):
    """Checks a code; returns a verification token on success."""
    destination = normalize_destination(channel, destination)
    challenge = (
        CheckoutVerification.objects.filter(
            channel=channel, destination=destination, session_ref=_clean_ref(session_ref), verified_at__isnull=True
        )
        .exclude(code_hash="")
        .order_by("-created_at")
        .first()
    )
    if challenge is None:
        raise VerificationError("Please request a new code.", code="no_active_code")
    if challenge.expires_at <= timezone.now():
        challenge.code_hash = ""
        challenge.save(update_fields=["code_hash"])
        raise VerificationError("This code has expired. Please request a new one.", code="expired")
    if challenge.attempts >= MAX_ATTEMPTS:
        raise VerificationError("Too many incorrect attempts. Please request a new code.", code="locked")

    if not hmac.compare_digest(challenge.code_hash, _digest(str(code or "").strip())):
        challenge.attempts += 1
        if challenge.attempts >= MAX_ATTEMPTS:
            challenge.code_hash = ""
        challenge.save(update_fields=["attempts", "code_hash"])
        remaining = MAX_ATTEMPTS - challenge.attempts
        if remaining <= 0:
            raise VerificationError("Too many incorrect attempts. Please request a new code.", code="locked")
        raise VerificationError(
            f"Incorrect code. {remaining} attempt{'s' if remaining != 1 else ''} left.", code="incorrect"
        )

    token = secrets.token_urlsafe(32)
    challenge.code_hash = ""  # single use
    challenge.verified_at = timezone.now()
    challenge.token_hash = _digest(token)
    challenge.token_expires_at = challenge.verified_at + TOKEN_LIFETIME
    challenge.save(update_fields=["code_hash", "verified_at", "token_hash", "token_expires_at"])
    return token


def check_token(channel, destination, token, session_ref=""):
    """True if `token` proves `destination` was verified on `channel` within
    the token lifetime, in the same browser checkout (`session_ref`)."""
    if not token:
        return False
    try:
        destination = normalize_destination(channel, destination)
    except VerificationError:
        return False
    return CheckoutVerification.objects.filter(
        channel=channel,
        destination=destination,
        session_ref=_clean_ref(session_ref),
        token_hash=_digest(str(token)),
        verified_at__isnull=False,
        token_expires_at__gt=timezone.now(),
    ).exists()
