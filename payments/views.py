import json
import logging

from rest_framework import serializers
from rest_framework.permissions import AllowAny
from rest_framework.throttling import AnonRateThrottle, UserRateThrottle
from rest_framework.views import APIView

from accounts.models import User
from common.response import error, success

from . import razorpay, sms, verification
from .models import CheckoutSession, CheckoutVerification
from .services import CheckoutError, create_checkout_session, fulfill_checkout, mark_failed

logger = logging.getLogger("payments")


class CheckoutAnonThrottle(AnonRateThrottle):
    scope = "checkout"


class CheckoutUserThrottle(UserRateThrottle):
    scope = "checkout"


def _activated_customer(request):
    user = request.user
    if user and user.is_authenticated and user.role == User.Role.CUSTOMER:
        return user
    return None


class GuestContactSerializer(serializers.Serializer):
    full_name = serializers.CharField(max_length=150)
    email = serializers.EmailField()
    phone = serializers.RegexField(r"^[6-9]\d{9}$", error_messages={"invalid": "Enter a valid 10-digit mobile number."})


class GuestAddressSerializer(serializers.Serializer):
    address_line1 = serializers.CharField(max_length=255)
    address_line2 = serializers.CharField(max_length=255, required=False, allow_blank=True, default="")
    landmark = serializers.CharField(max_length=100, required=False, allow_blank=True, default="")
    locality = serializers.CharField(max_length=100, required=False, allow_blank=True, default="")
    city = serializers.CharField(max_length=100)
    district = serializers.CharField(max_length=100)
    state = serializers.CharField(max_length=100)
    pincode = serializers.RegexField(r"^[1-9]\d{5}$", error_messages={"invalid": "Enter a valid 6-digit PIN code."})
    country = serializers.CharField(max_length=100, required=False, default="India")
    latitude = serializers.FloatField(required=False, allow_null=True, min_value=-90, max_value=90)
    longitude = serializers.FloatField(required=False, allow_null=True, min_value=-180, max_value=180)


class RazorpayConfigView(APIView):
    """Whether online payment is available, and the public key id the
    browser needs to open Razorpay Checkout. Never returns any secret."""

    permission_classes = [AllowAny]
    authentication_classes = []

    def get(self, request):
        enabled = razorpay.is_configured()
        return success(
            {
                "enabled": enabled,
                "key_id": razorpay.public_key_id() if enabled else "",
                "currency": "INR",
                "sms_otp_enabled": sms.is_configured(),
            }
        )


class RazorpayCheckoutView(APIView):
    """Starts a Razorpay payment. A signed-in customer pays for their own
    cart with one of their saved addresses; a guest sends contact details,
    a delivery address and their cart lines (product ids + quantities only —
    prices always come from the catalogue)."""

    permission_classes = [AllowAny]
    throttle_classes = [CheckoutAnonThrottle, CheckoutUserThrottle]

    def post(self, request):
        customer = _activated_customer(request)
        try:
            if customer is not None:
                session = create_checkout_session(customer=customer, address_id=request.data.get("address_id"))
            else:
                contact = GuestContactSerializer(data=request.data.get("contact") or {})
                address = GuestAddressSerializer(data=request.data.get("address") or {})
                contact_ok, address_ok = contact.is_valid(), address.is_valid()
                if not (contact_ok and address_ok):
                    return error(
                        "Please check your details.",
                        errors={"contact": contact.errors if not contact_ok else {}, "address": address.errors if not address_ok else {}},
                    )
                session = create_checkout_session(
                    contact=contact.validated_data,
                    address=address.validated_data,
                    items=request.data.get("items"),
                    email_token=request.data.get("email_verification_token"),
                    phone_token=request.data.get("phone_verification_token"),
                    session_ref=request.data.get("session_ref", ""),
                )
        except CheckoutError as exc:
            return error(exc.message, errors=exc.errors, status=exc.status)

        return success(
            {
                "checkout_id": str(session.public_id),
                "razorpay_order_id": session.razorpay_order_id,
                "key_id": razorpay.public_key_id(),
                "amount": session.amount_paise,
                "currency": session.currency,
                "summary": {
                    "subtotal": str(session.subtotal),
                    "first_order_discount_amount": str(session.first_order_discount_amount or 0),
                    "shipping": str(session.shipping),
                    "total": str(session.total),
                },
                "prefill": {"name": session.full_name, "email": session.email, "contact": session.phone},
            },
            status=201,
        )


class OtpThrottle(AnonRateThrottle):
    scope = "checkout_otp"


def _channel(request):
    value = str(request.data.get("channel", "")).upper()
    return value if value in CheckoutVerification.Channel.values else None


class CheckoutOtpSendView(APIView):
    """Sends a 6-digit code to a guest's email or mobile number before
    checkout. Rate-limited per IP, with a per-destination cooldown."""

    permission_classes = [AllowAny]
    authentication_classes = []
    throttle_classes = [OtpThrottle]

    def post(self, request):
        channel = _channel(request)
        if channel is None:
            return error("Choose email or mobile verification.", errors={"channel": ["Invalid."]})
        try:
            cooldown = verification.send_code(
                channel, request.data.get("destination"), request.data.get("session_ref", "")
            )
        except verification.VerificationError as exc:
            errors = {"code": exc.code}
            if exc.retry_after:
                errors["retry_after"] = exc.retry_after
            return error(exc.message, errors=errors, status=exc.status)
        return success({"resend_after": cooldown}, message="Verification code sent.")


class CheckoutOtpVerifyView(APIView):
    """Checks a code; a correct one returns the verification token the
    checkout endpoint requires."""

    permission_classes = [AllowAny]
    authentication_classes = []
    throttle_classes = [OtpThrottle]

    def post(self, request):
        channel = _channel(request)
        if channel is None:
            return error("Choose email or mobile verification.", errors={"channel": ["Invalid."]})
        try:
            token = verification.verify_code(
                channel,
                request.data.get("destination"),
                request.data.get("code"),
                request.data.get("session_ref", ""),
            )
        except verification.VerificationError as exc:
            return error(exc.message, errors={"code": exc.code}, status=exc.status)
        return success({"verification_token": token}, message="Verified.")


class RazorpayVerifyView(APIView):
    """Called by the browser after Razorpay Checkout reports success. The
    payment is trusted only if Razorpay's signature checks out against our
    key secret — never because the browser says so."""

    permission_classes = [AllowAny]
    authentication_classes = []
    throttle_classes = [CheckoutAnonThrottle]

    def post(self, request):
        order_id = str(request.data.get("razorpay_order_id", ""))
        payment_id = str(request.data.get("razorpay_payment_id", ""))
        signature = str(request.data.get("razorpay_signature", ""))
        if not (order_id and payment_id and razorpay.verify_payment_signature(order_id, payment_id, signature)):
            logger.warning("payments.verify.bad_signature order=%s", order_id)
            return error("We couldn't verify this payment.", errors={"code": "invalid_signature"}, status=400)
        try:
            session, account_created = fulfill_checkout(order_id, payment_id, via="verify")
        except CheckoutError as exc:
            return error(exc.message, status=exc.status)
        order = session.order
        return success(
            {
                "order_id": order.pk,
                "order_number": order.order_number,
                "tracking_token": str(order.tracking_token),
                "email": session.email,
                # True while the account is waiting for its first password
                # setup — the page then points the buyer to their inbox.
                "account_created": account_created or order.customer.must_change_password,
            },
            message="Payment verified. Your order is confirmed.",
        )


class RazorpayWebhookView(APIView):
    """Razorpay → us. Authenticated by the X-Razorpay-Signature HMAC over
    the raw body (RAZORPAY_WEBHOOK_SECRET). Fulfilment is idempotent, so
    Razorpay's retries and a webhook racing the browser's verify call both
    end in exactly one order and one account."""

    permission_classes = [AllowAny]
    authentication_classes = []

    def post(self, request):
        raw = request.body
        if not razorpay.verify_webhook_signature(raw, request.headers.get("X-Razorpay-Signature", "")):
            return error("Invalid signature.", status=400)
        try:
            event = json.loads(raw.decode() or "{}")
        except ValueError:
            return error("Invalid payload.", status=400)

        name = event.get("event", "")
        payment = ((event.get("payload") or {}).get("payment") or {}).get("entity") or {}
        order_id = payment.get("order_id") or (((event.get("payload") or {}).get("order") or {}).get("entity") or {}).get("id")
        if not order_id:
            return success(message="Ignored.")

        if name in ("payment.captured", "order.paid"):
            session = CheckoutSession.objects.filter(razorpay_order_id=order_id).first()
            if session is None:
                return success(message="Ignored.")
            if payment.get("amount") is not None and int(payment["amount"]) != session.amount_paise:
                logger.error("payments.webhook.amount_mismatch order=%s", order_id)
                return success(message="Amount mismatch — not fulfilled.")
            try:
                fulfill_checkout(order_id, payment.get("id") or session.razorpay_payment_id or "", via="webhook")
            except CheckoutError:
                return success(message="Ignored.")
            return success(message="Fulfilled.")
        if name == "payment.failed":
            mark_failed(order_id)
            return success(message="Recorded.")
        return success(message="Ignored.")
