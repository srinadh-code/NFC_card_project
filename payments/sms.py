"""SMS delivery for checkout OTPs through MSG91.

We generate the code ourselves (payments/verification.py stores only its
HMAC) and ask MSG91 to deliver it with a DLT-approved OTP template:
POST {MSG91_API_BASE}/otp?template_id=...&mobile=91XXXXXXXXXX&otp=XXXXXX
with the `authkey` header. Credentials come from the environment only
(MSG91_AUTH_KEY, MSG91_OTP_TEMPLATE_ID). The code and the auth key are never
logged.
"""

import logging

import requests
from django.conf import settings

logger = logging.getLogger("payments.sms")

REQUEST_TIMEOUT_SECONDS = 10


class SmsNotConfigured(Exception):
    pass


class SmsDeliveryError(Exception):
    pass


def is_configured():
    return bool(settings.MSG91_AUTH_KEY and settings.MSG91_OTP_TEMPLATE_ID)


def send_otp(mobile_digits, code):
    """`mobile_digits` is a 10-digit Indian mobile number."""
    if not is_configured():
        raise SmsNotConfigured
    try:
        response = requests.post(
            f"{settings.MSG91_API_BASE.rstrip('/')}/otp",
            params={
                "template_id": settings.MSG91_OTP_TEMPLATE_ID,
                "mobile": f"91{mobile_digits}",
                "otp": code,
                "otp_expiry": 5,
            },
            headers={"authkey": settings.MSG91_AUTH_KEY, "accept": "application/json"},
            timeout=REQUEST_TIMEOUT_SECONDS,
        )
    except requests.RequestException as exc:
        logger.warning("sms.msg91.network_error %s", type(exc).__name__)
        raise SmsDeliveryError from exc
    ok = response.status_code < 300
    if ok:
        try:
            ok = str(response.json().get("type", "success")).lower() == "success"
        except ValueError:
            ok = True
    if not ok:
        logger.warning("sms.msg91.rejected status=%s", response.status_code)
        raise SmsDeliveryError
    return True
