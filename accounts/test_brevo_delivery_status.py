"""Transport acceptance is observable, without claiming mailbox delivery."""
from unittest.mock import Mock, patch

from django.core.cache import cache
from django.test import SimpleTestCase, override_settings
from django.urls import reverse
import requests
from rest_framework.test import APITestCase

from accounts.emails import PermanentEmailDeliveryError, send_brevo_email
from payments.models import CheckoutVerification


@override_settings(BREVO_API_KEY="synthetic-api-key", BREVO_SENDER_EMAIL="sender@example.test", BREVO_SENDER_NAME="Fixture")
class BrevoAcceptanceTests(SimpleTestCase):
    def send(self, **kwargs):
        return send_brevo_email("buyer@example.test", "Fixture subject", "<p>private-code-fixture</p>",
                                "private-code-fixture", "purpose=checkout_otp", **kwargs)

    def response(self, status=201, data=None):
        response = Mock(status_code=status)
        response.json.return_value = data
        return response

    def assert_private_values_absent(self, output):
        for private in ("synthetic-api-key", "private-code-fixture", "buyer@example.test", "sensitive-provider-detail"):
            self.assertNotIn(private, output)

    def test_acceptance_logs_message_id_and_purpose_without_claiming_delivery(self):
        response = self.response(data={"messageId": "<20261113.fixture@smtp-relay.mailin.fr>"})
        with patch("accounts.emails.requests.post", return_value=response) as post, \
                self.assertLogs("accounts.email", "INFO") as logs:
            self.assertTrue(self.send())
        output = "\n".join(logs.output)
        self.assertIn("email.brevo.accepted", output)
        self.assertIn("message_id=<20261113.fixture@smtp-relay.mailin.fr>", output)
        self.assertNotIn("delivered", output)
        self.assertNotIn("email.brevo.sent", output)
        self.assert_private_values_absent(output)
        payload = post.call_args.kwargs["json"]
        self.assertEqual(payload["to"], [{"email": "buyer@example.test"}])
        self.assertEqual(payload["tags"], ["checkout_otp"])
        self.assertEqual(payload["textContent"], "private-code-fixture")
        post.assert_called_once()

    def test_accepted_response_without_receipt_does_not_trigger_duplicate_send(self):
        response = self.response()
        response.json.side_effect = ValueError("sensitive-provider-detail")
        with patch("accounts.emails.requests.post", return_value=response) as post, \
                self.assertLogs("accounts.email", "INFO") as logs:
            self.assertTrue(self.send(raise_permanent=True))
        self.assertIn("message_id=unavailable", "\n".join(logs.output))
        self.assert_private_values_absent("\n".join(logs.output))
        post.assert_called_once()

    def test_malformed_message_ids_cannot_inject_secrets_or_log_lines(self):
        for message_id in ("sensitive-provider-detail\nforged", [], {}, "x" * 1000, None):
            with self.subTest(kind=type(message_id).__name__), \
                    patch("accounts.emails.requests.post", return_value=self.response(data={"messageId": message_id})), \
                    self.assertLogs("accounts.email", "INFO") as logs:
                self.assertTrue(self.send())
            output = "\n".join(logs.output)
            self.assertIn("message_id=unavailable", output)
            self.assert_private_values_absent(output)
            self.assertNotIn("forged", output)

    def test_permanent_recipient_rejections_are_classified_for_retrying_callers(self):
        reasons = (("recipient_blocked", "Recipient email is blacklisted"),
                   ("recipient_bounced", "Recipient email hard bounced"),
                   ("recipient_unsubscribed", "Recipient email unsubscribed"))
        for expected, reason in reasons:
            for detail in ({"code": expected, "message": "sensitive-provider-detail"},
                           {"code": "invalid_parameter", "message": reason + " sensitive-provider-detail"}):
                with self.subTest(code=expected), \
                        patch("accounts.emails.requests.post", return_value=self.response(400, detail)) as post, \
                        self.assertLogs("accounts.email", "ERROR") as logs:
                    with self.assertRaises(PermanentEmailDeliveryError) as error:
                        self.send(raise_permanent=True)
                self.assertEqual(error.exception.code, expected)
                self.assert_private_values_absent("\n".join(logs.output))
                post.assert_called_once()

    def test_default_boolean_contract_is_preserved_for_permanent_rejections(self):
        with patch("accounts.emails.requests.post", return_value=self.response(400, {"code": "recipient_blocked"})):
            self.assertFalse(self.send())

    def test_transient_and_sender_configuration_errors_do_not_become_recipient_blocks(self):
        cases = ((429, {"code": "recipient_blocked"}), (503, {"code": "recipient_bounced"}),
                 (408, {"code": "recipient_blocked"}), (401, {"code": "unauthorized"}),
                 (400, {"code": "invalid_parameter", "message": "Sender email is blocked"}),
                 (400, {"code": "invalid_parameter", "message": "Transactional email sending is blocked for your account."}),
                 (400, {"code": "invalid_parameter", "message": "Your email API account is suspended and blocked."}),
                 (400, {"code": "invalid_parameter", "message": "The recipient email is temporarily blocked by greylisting; retry later."}))
        for status, data in cases:
            with self.subTest(status=status), patch("accounts.emails.requests.post", return_value=self.response(status, data)):
                self.assertFalse(self.send(raise_permanent=True))

    def test_provider_timeouts_do_not_log_exception_content_or_retry_inline(self):
        for exception in (requests.Timeout("sensitive-provider-detail"), requests.RequestException("synthetic-api-key")):
            with self.subTest(kind=type(exception).__name__), \
                    patch("accounts.emails.requests.post", side_effect=exception) as post, \
                    self.assertLogs("accounts.email", "ERROR") as logs:
                self.assertFalse(self.send(raise_permanent=True))
            self.assert_private_values_absent("\n".join(logs.output))
            post.assert_called_once()

    def test_malformed_rejection_responses_remain_safe_boolean_failures(self):
        for data in (None, [], {"code": []}, {"code": "sensitive-provider-detail", "message": "private-code-fixture"}):
            with self.subTest(kind=type(data).__name__), \
                    patch("accounts.emails.requests.post", return_value=self.response(400, data)), \
                    self.assertLogs("accounts.email", "ERROR") as logs:
                self.assertFalse(self.send(raise_permanent=True))
            self.assert_private_values_absent("\n".join(logs.output))


@override_settings(BREVO_API_KEY="synthetic-api-key", BREVO_SENDER_EMAIL="sender@example.test")
class CheckoutEmailPipelineTests(APITestCase):
    def setUp(self):
        cache.clear()
        self.addCleanup(cache.clear)

    def test_purchaser_destination_and_template_reach_provider_then_single_use_verification(self):
        response = Mock(status_code=201)
        response.json.return_value = {"messageId": "<fixture@smtp-relay.mailin.fr>"}
        with patch("accounts.emails.requests.post", return_value=response) as post, \
                patch("payments.verification.secrets.randbelow", return_value=123456), \
                self.assertLogs("accounts.email", "INFO") as logs:
            sent = self.client.post(reverse("checkout-otp-send"), {
                "channel": "EMAIL", "destination": "  Buyer@Example.Test  ", "session_ref": "fixture-checkout",
            }, format="json")
        self.assertEqual(sent.status_code, 200, sent.content)
        payload = post.call_args.kwargs["json"]
        self.assertEqual(payload["to"], [{"email": "buyer@example.test"}])
        self.assertEqual(payload["tags"], ["checkout_otp"])
        self.assertIn("123456", payload["htmlContent"])
        self.assertIn("123456", payload["textContent"])
        self.assertNotIn("123456", "\n".join(logs.output))
        challenge = CheckoutVerification.objects.get()
        self.assertNotEqual(challenge.code_hash, "123456")
        verification = {"channel": "EMAIL", "destination": "buyer@example.test", "code": "123456",
                        "session_ref": "fixture-checkout"}
        self.assertEqual(self.client.post(reverse("checkout-otp-verify"), verification, format="json").status_code, 200)
        self.assertEqual(self.client.post(reverse("checkout-otp-verify"), verification, format="json").status_code, 400)

    def test_permanently_blocked_checkout_fails_without_retaining_a_challenge(self):
        response = Mock(status_code=400)
        response.json.return_value = {"code": "recipient_blocked"}
        with patch("accounts.emails.requests.post", return_value=response) as post:
            sent = self.client.post(reverse("checkout-otp-send"), {
                "channel": "EMAIL", "destination": "buyer@example.test", "session_ref": "fixture-checkout",
            }, format="json")
        self.assertEqual(sent.status_code, 502)
        self.assertEqual(sent.data["errors"]["code"], "delivery_failed")
        self.assertFalse(CheckoutVerification.objects.exists())
        post.assert_called_once()

    def test_malformed_destinations_are_rejected_before_sending_or_creating_challenges(self):
        for destination in ({"email": "buyer@example.test"}, ["buyer@example.test"], 123, True, "x" * 245 + "@example.test"):
            with self.subTest(kind=type(destination).__name__), patch("accounts.emails.requests.post") as post:
                sent = self.client.post(reverse("checkout-otp-send"), {
                    "channel": "EMAIL", "destination": destination, "session_ref": "fixture-checkout",
                }, format="json")
            self.assertEqual(sent.status_code, 400)
            self.assertEqual(sent.data["errors"]["code"], "invalid_destination")
            post.assert_not_called()
        self.assertFalse(CheckoutVerification.objects.exists())

    def test_malformed_token_destinations_fail_closed_without_querying(self):
        from payments import verification

        for destination in ({"email": "buyer@example.test"}, ["buyer@example.test"], 123, True):
            with self.subTest(kind=type(destination).__name__), patch.object(CheckoutVerification.objects, "filter") as query:
                self.assertFalse(verification.check_token("EMAIL", destination, "fixture-token", "fixture-checkout"))
            query.assert_not_called()
