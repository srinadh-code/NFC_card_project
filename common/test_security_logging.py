"""Diagnostic failures must not copy private locations or provider secrets."""
from types import SimpleNamespace
from unittest.mock import Mock, patch

from django.test import SimpleTestCase, override_settings
import requests

from accounts.emails import send_order_confirmation_email
from customer_management.customer_addresses import geocoding, pincode


class DiagnosticLoggingSecurityTests(SimpleTestCase):
    private_text = "private-location@example.test token=private-provider-token\nforged-log-entry"

    def assert_private_text_absent(self, logs):
        text = "\n".join(logs.output)
        self.assertNotIn(self.private_text, text)
        self.assertNotIn("private-provider-token", text)
        self.assertNotIn("forged-log-entry", text)
        self.assertTrue(all(record.exc_info is None for record in logs.records))

    def test_geocoding_search_network_failure_logs_category_only(self):
        with patch.object(geocoding.requests, "get", side_effect=requests.RequestException(self.private_text)), \
                self.assertLogs(geocoding.logger, "WARNING") as logs:
            with self.assertRaises(geocoding.GeocodingUnavailable):
                geocoding._fetch_search(self.private_text, None)
        self.assert_private_text_absent(logs)
        self.assertIn("operation=search error=RequestException", logs.output[0])

    def test_geocoding_reverse_failure_does_not_log_coordinates(self):
        with patch.object(geocoding, "REVERSE_MIN_INTERVAL_SECONDS", 0), \
                patch.object(geocoding.requests, "get", side_effect=requests.Timeout(self.private_text)), \
                self.assertLogs(geocoding.logger, "WARNING") as logs:
            with self.assertRaises(geocoding.GeocodingUnavailable):
                geocoding._fetch_reverse(17.123456, 78.654321)
        self.assert_private_text_absent(logs)
        self.assertNotIn("17.123456", "\n".join(logs.output))
        self.assertNotIn("78.654321", "\n".join(logs.output))

    def test_geocoding_invalid_response_does_not_log_query_or_payload(self):
        response = Mock()
        response.json.return_value = {"error": self.private_text}
        with patch.object(geocoding.requests, "get", return_value=response), \
                self.assertLogs(geocoding.logger, "WARNING") as logs:
            with self.assertRaises(geocoding.GeocodingUnavailable):
                geocoding._fetch_search(self.private_text, None)
        self.assert_private_text_absent(logs)

    def test_post_office_network_failure_does_not_log_name_or_exception(self):
        with patch.object(pincode.requests, "get", side_effect=requests.RequestException(self.private_text)), \
                self.assertLogs(pincode.logger, "WARNING") as logs:
            with self.assertRaises(pincode.PincodeServiceUnavailable):
                pincode._fetch_post_offices_by_name(self.private_text)
        self.assert_private_text_absent(logs)

    def test_post_office_invalid_response_does_not_log_provider_payload(self):
        response = Mock()
        response.json.return_value = [{"Status": "Unexpected", "message": self.private_text}]
        with patch.object(pincode.requests, "get", return_value=response), \
                self.assertLogs(pincode.logger, "WARNING") as logs:
            with self.assertRaises(pincode.PincodeServiceUnavailable):
                pincode._fetch_post_offices_by_name(self.private_text)
        self.assert_private_text_absent(logs)

    def test_invalid_payment_signature_does_not_log_untrusted_order_identifier(self):
        from payments.views import RazorpayVerifyView
        from rest_framework.test import APIRequestFactory

        request = APIRequestFactory().post("/api/payments/razorpay/verify/", {
            "razorpay_order_id": self.private_text,
            "razorpay_payment_id": "fixture-payment",
            "razorpay_signature": "invalid",
        }, format="json")
        with patch("payments.views.razorpay.verify_payment_signature", return_value=False), \
                self.assertLogs("payments", "WARNING") as logs:
            response = RazorpayVerifyView.as_view()(request)
        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.data["errors"]["code"], "invalid_signature")
        self.assert_private_text_absent(logs)

    @override_settings(FRONTEND_URL="https://example.test")
    def test_order_email_failure_does_not_log_provider_exception_or_traceback(self):
        order = SimpleNamespace(pk=12, order_number="ORD000012", tracking_token="private-tracking-token",
                                purchaser_name="Fixture", purchaser_email="fixture@example.test")
        user = SimpleNamespace(full_name="Fixture", email="fixture@example.test")
        with patch("accounts.onboarding.send_email", side_effect=RuntimeError(self.private_text)), \
                self.assertLogs("accounts.email", "ERROR") as logs:
            self.assertFalse(send_order_confirmation_email(user, order))
        self.assert_private_text_absent(logs)
        self.assertIn("order_id=12 error=RuntimeError", logs.output[0])
