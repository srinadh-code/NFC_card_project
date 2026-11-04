"""Minimal Razorpay client over its REST API (no SDK dependency).

Credentials come from the environment first (RAZORPAY_KEY_ID /
RAZORPAY_KEY_SECRET / RAZORPAY_WEBHOOK_SECRET), falling back to the key id
and secret an admin saved in Settings > Payment. Secrets are never logged
or returned by any API — only the public key id is sent to the browser.
"""

import hashlib
import hmac
import logging

import requests
from django.conf import settings

logger = logging.getLogger("payments.razorpay")

REQUEST_TIMEOUT_SECONDS = 15


class RazorpayNotConfigured(Exception):
    pass


class RazorpayError(Exception):
    pass


def _payment_settings():
    from website_content.models import PaymentSettings

    return PaymentSettings.objects.first()


def credentials():
    key_id = settings.RAZORPAY_KEY_ID
    secret = settings.RAZORPAY_KEY_SECRET
    if not (key_id and secret):
        row = _payment_settings()
        if row is not None:
            key_id = key_id or row.razorpay_key_id.strip()
            secret = secret or row.razorpay_secret.strip()
    return key_id, secret


def is_configured():
    key_id, secret = credentials()
    return bool(key_id and secret)


def public_key_id():
    return credentials()[0]


def create_order(amount_paise, *, receipt, notes=None, currency="INR"):
    """Creates a Razorpay order and returns its JSON (has "id")."""
    key_id, secret = credentials()
    if not (key_id and secret):
        raise RazorpayNotConfigured
    try:
        response = requests.post(
            f"{settings.RAZORPAY_API_BASE.rstrip('/')}/orders",
            auth=(key_id, secret),
            json={"amount": amount_paise, "currency": currency, "receipt": receipt[:40], "notes": notes or {}},
            timeout=REQUEST_TIMEOUT_SECONDS,
        )
    except requests.RequestException as exc:
        logger.warning("razorpay.create_order.network_error %s", type(exc).__name__)
        raise RazorpayError("Payment service unreachable") from exc
    if response.status_code >= 300:
        logger.warning("razorpay.create_order.rejected status=%s", response.status_code)
        raise RazorpayError(f"Payment service rejected the order ({response.status_code})")
    data = response.json()
    if not data.get("id"):
        raise RazorpayError("Payment service returned no order id")
    return data


def _matches(expected_hex, signature):
    return bool(signature) and hmac.compare_digest(expected_hex, str(signature))


def verify_payment_signature(razorpay_order_id, razorpay_payment_id, signature):
    """Checkout handler signature: HMAC-SHA256(order_id|payment_id, key_secret)."""
    _, secret = credentials()
    if not secret:
        return False
    message = f"{razorpay_order_id}|{razorpay_payment_id}".encode()
    expected = hmac.new(secret.encode(), message, hashlib.sha256).hexdigest()
    return _matches(expected, signature)


def verify_webhook_signature(raw_body, signature):
    """Webhook signature: HMAC-SHA256(raw request body, webhook secret)."""
    secret = settings.RAZORPAY_WEBHOOK_SECRET
    if not secret:
        return False
    expected = hmac.new(secret.encode(), raw_body, hashlib.sha256).hexdigest()
    return _matches(expected, signature)
