"""Public payment payloads reject malformed envelopes before side effects."""
import hashlib
import hmac
import json
from types import SimpleNamespace
from unittest.mock import patch

from django.core.cache import cache
from django.test import SimpleTestCase, override_settings
from django.urls import reverse
from rest_framework.test import APIClient

from payments import views


@override_settings(RAZORPAY_WEBHOOK_SECRET="offline-body-validation-secret")
class PaymentBodyValidationSecurityTests(SimpleTestCase):
    def setUp(self):
        self.client = APIClient()
        cache.clear()
        self.addCleanup(cache.clear)

    def _webhook(self, payload, *, valid_signature=True):
        raw = json.dumps(payload).encode()
        signature = hmac.new(b"offline-body-validation-secret", raw, hashlib.sha256).hexdigest()
        return self.client.post(reverse("razorpay-webhook"), raw, content_type="application/json",
                                HTTP_X_RAZORPAY_SIGNATURE=signature if valid_signature else "invalid")

    def test_non_object_bodies_are_rejected_before_payment_or_otp_services(self):
        cases = (
            ("razorpay-checkout", views.RazorpayCheckoutView),
            ("checkout-otp-send", views.CheckoutOtpSendView),
            ("checkout-otp-verify", views.CheckoutOtpVerifyView),
            ("razorpay-verify", views.RazorpayVerifyView),
            ("dummy-payment-confirm", views.DummyPaymentConfirmView),
        )
        with patch.object(views, "create_checkout_session") as checkout, \
                patch.object(views, "fulfill_checkout") as fulfill, \
                patch.object(views, "confirm_dummy_payment") as dummy, \
                patch.object(views.verification, "send_code") as send, \
                patch.object(views.verification, "verify_code") as verify:
            for route, view in cases:
                with patch.object(view, "throttle_classes", []):
                    for body in ([], ["invalid"], "invalid", 123, True):
                        with self.subTest(route=route, body=body):
                            response = self.client.post(reverse(route), body, format="json")
                            self.assertEqual(response.status_code, 400)
            for service in (checkout, fulfill, dummy, send, verify):
                service.assert_not_called()

    def test_valid_otp_objects_retain_existing_service_arguments_and_responses(self):
        with patch.object(views.verification, "send_code", return_value=60) as send, \
                patch.object(views.verification, "verify_code", return_value="fixture-token") as verify:
            response = self.client.post(reverse("checkout-otp-send"), {
                "channel": "email", "destination": "fixture@example.test", "session_ref": "fixture-session",
            }, format="json")
            self.assertEqual(response.status_code, 200)
            self.assertEqual(response.data["data"]["resend_after"], 60)
            send.assert_called_once_with("EMAIL", "fixture@example.test", "fixture-session")
            response = self.client.post(reverse("checkout-otp-verify"), {
                "channel": "email", "destination": "fixture@example.test", "code": "123456",
                "session_ref": "fixture-session",
            }, format="json")
            self.assertEqual(response.status_code, 200)
            self.assertEqual(response.data["data"]["verification_token"], "fixture-token")
            verify.assert_called_once_with("EMAIL", "fixture@example.test", "123456", "fixture-session")

    def test_signed_malformed_webhook_envelopes_are_rejected_before_database_or_fulfillment(self):
        cases = ([], ["invalid"], "invalid", 123, True,
                 {"payload": ["invalid"]}, {"payload": {"payment": "invalid"}},
                 {"payload": {"order": ["invalid"]}},
                 {"payload": {"payment": {"entity": "invalid"}}},
                 {"payload": {"order": {"entity": ["invalid"]}}})
        with patch.object(views.CheckoutSession.objects, "filter") as lookup, \
                patch.object(views, "fulfill_checkout") as fulfill:
            for body in cases:
                with self.subTest(body=body):
                    response = self._webhook(body)
                    self.assertEqual(response.status_code, 400)
            lookup.assert_not_called()
            fulfill.assert_not_called()

    def test_webhook_proof_is_checked_before_envelope_processing(self):
        response = self._webhook(["invalid"], valid_signature=False)
        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.data["message"], "Invalid signature.")

    def test_valid_captured_webhook_retains_existing_fulfillment_path(self):
        body = {"event": "payment.captured", "payload": {"payment": {"entity": {
            "order_id": "order_fixture", "id": "pay_fixture", "amount": 100,
        }}}}
        with patch.object(views.CheckoutSession.objects, "filter") as lookup, \
                patch.object(views, "fulfill_checkout") as fulfill:
            lookup.return_value.first.return_value = SimpleNamespace(amount_paise=100, razorpay_payment_id="")
            response = self._webhook(body)
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["message"], "Fulfilled.")
        fulfill.assert_called_once_with("order_fixture", "pay_fixture", via="webhook")

    def test_invalid_webhook_amount_does_not_fulfill(self):
        with patch.object(views.CheckoutSession.objects, "filter") as lookup, \
                patch.object(views, "fulfill_checkout") as fulfill:
            lookup.return_value.first.return_value = SimpleNamespace(amount_paise=100)
            for amount in ("invalid", {}, [], "9" * 5000, float("inf")):
                with self.subTest(amount_type=type(amount).__name__):
                    response = self._webhook({"event": "payment.captured", "payload": {"payment": {
                        "entity": {"order_id": "order_fixture", "id": "pay_fixture", "amount": amount},
                    }}})
                    self.assertEqual(response.status_code, 400)
            fulfill.assert_not_called()

    def test_infinite_dummy_amount_returns_validation_error_without_confirmation(self):
        with patch.object(views, "confirm_dummy_payment") as confirm:
            response = self.client.post(reverse("dummy-payment-confirm"),
                                        '{"checkout_id":"fixture","amount":1e309}',
                                        content_type="application/json")
        self.assertEqual(response.status_code, 400)
        confirm.assert_not_called()
