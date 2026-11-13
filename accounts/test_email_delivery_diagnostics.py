"""Read-only email diagnostics must distinguish configuration from delivery."""

from io import StringIO
from unittest.mock import Mock, patch

import requests
from django.core.management import call_command
from django.core.management.base import CommandError
from django.test import SimpleTestCase, override_settings


COMMAND = "accounts.management.commands.check_email_delivery"
MESSAGE_ID = "<fixture.123@smtp-relay.example>"
PRIVATE = "private@example.test OTP=654321 token=private-api-key"


def response(detail=None, status=200, invalid_json=False):
    result = Mock(status_code=status)
    if invalid_json:
        result.json.side_effect = ValueError(PRIVATE)
    else:
        result.json.return_value = detail
    return result


@override_settings(BREVO_API_KEY="offline-diagnostic-key", BREVO_SENDER_EMAIL="sender@example.test")
class EmailDeliveryDiagnosticTests(SimpleTestCase):
    def setUp(self):
        for name, target, value in (
            ("http", "requests.get", None),
            ("send", "send_email", True),
            ("smtp", "smtp_configured", False),
            ("available", "real_delivery_available", True),
            ("connection", "get_connection", None),
            ("configured_connection", "_email_connection_and_sender", (None, "sender@example.test")),
        ):
            patcher = patch(f"{COMMAND}.{target}", return_value=value)
            setattr(self, name, patcher.start())
            self.addCleanup(patcher.stop)
        self.http.side_effect = self._configuration_responses()

    def _configuration_responses(self):
        return [response({"id": 1, "relay": {"enabled": True}}),
                response({"senders": [{"email": "SENDER@example.test", "active": True}]})]

    def _run(self, **options):
        output = StringIO()
        call_command("check_email_delivery", stdout=output, no_color=True, skip_checks=True, **options)
        return output.getvalue()

    def test_default_checks_configuration_without_sending_or_claiming_delivery(self):
        output = self._run()
        self.send.assert_not_called()
        self.connection.assert_not_called()
        self.assertEqual(self.http.call_count, 2)
        self.assertIn("API key accepted", output)
        self.assertIn("sender address is verified", output)
        self.assertIn("inbox delivery remains unverified", output)
        self.assertNotIn("Email delivery looks good", output)
        self.assertNotIn("sender@example.test", output)

    def test_sender_lookup_network_failure_is_safe_and_does_not_crash(self):
        self.http.side_effect = [response({}), requests.Timeout(PRIVATE)]
        output = self._run()
        self.assertIn("Brevo senders: unreachable (Timeout)", output)
        self.assertNotIn(PRIVATE, output)
        self.assertIn("checks need attention", output)
        self.send.assert_not_called()

    def test_non_json_account_and_sender_responses_are_reported_safely(self):
        for replies in ([response(invalid_json=True)], [response({}), response(invalid_json=True)]):
            with self.subTest(stage="account" if len(replies) == 1 else "senders"):
                self.http.side_effect = replies
                output = self._run()
                self.assertIn("malformed response", output)
                self.assertNotIn(PRIVATE, output)
        self.send.assert_not_called()

    def test_malformed_sender_shapes_do_not_crash_or_look_verified(self):
        for detail in ([], {}, {"senders": None}, {"senders": {}}, {"senders": [None]},
                       {"senders": [{"email": 123, "active": True}]},
                       {"senders": [{"email": "sender@example.test", "active": "false"}]}):
            with self.subTest(detail=detail):
                self.http.side_effect = [response({}), response(detail)]
                output = self._run()
                self.assertNotIn("sender address is verified", output)
                self.assertIn("checks need attention", output)
        self.send.assert_not_called()

    def test_http_rejections_use_allowlisted_codes_without_raw_provider_details(self):
        for code, expected in (("unauthorized", "unauthorized"), (PRIVATE, "provider_error"), ({}, "provider_error")):
            with self.subTest(expected=expected):
                self.http.side_effect = [response({"code": code, "message": PRIVATE}, status=401)]
                output = self._run()
                self.assertIn(f"HTTP 401; code={expected}", output)
                self.assertNotIn(PRIVATE, output)
                self.assertNotIn("offline-diagnostic-key", output)

    def test_sender_http_failure_is_reported_without_raw_error_text(self):
        self.http.side_effect = [response({}), response({"code": "permission_denied", "message": PRIVATE}, status=403)]
        output = self._run()
        self.assertIn("Brevo senders: rejected (HTTP 403; code=permission_denied)", output)
        self.assertNotIn(PRIVATE, output)
        self.send.assert_not_called()

    def test_smtp_failure_prints_exception_class_without_private_message(self):
        self.smtp.return_value = True
        connection = Mock()
        connection.open.side_effect = RuntimeError(PRIVATE)
        self.connection.return_value = connection
        output = self._run()
        self.assertIn("SMTP: failed (RuntimeError)", output)
        self.assertNotIn(PRIVATE, output)
        self.send.assert_not_called()

    @override_settings(EMAIL_HOST="", EMAIL_BACKEND="django.core.mail.backends.console.EmailBackend")
    def test_admin_smtp_connection_is_checked_instead_of_the_console_backend(self):
        self.smtp.return_value = True
        admin_connection = Mock()
        self.configured_connection.return_value = (admin_connection, "private-sender@example.test")
        output = self._run()
        self.configured_connection.assert_called_once()
        admin_connection.open.assert_called_once()
        admin_connection.close.assert_called_once()
        self.connection.assert_not_called()
        self.assertIn("SMTP: login succeeded", output)
        self.assertNotIn("private-sender@example.test", output)
        self.send.assert_not_called()

    def test_explicit_send_option_requests_one_transport_send_without_claiming_delivery(self):
        output = self._run(send_to="controlled@example.test")
        self.send.assert_called_once()
        self.assertEqual(self.send.call_args.args[0], "controlled@example.test")
        self.assertIn("Test email: accepted by transport; inbox delivery unverified", output)
        self.assertNotIn("controlled@example.test", output)

    def test_invalid_message_id_is_rejected_before_any_network_or_send(self):
        for value in ("invalid", "<id@domain>\nprivate-token", PRIVATE, 123, ""):
            with self.subTest(value_type=type(value).__name__):
                with self.assertRaisesMessage(CommandError, "Invalid Brevo message ID."):
                    self._run(message_id=value)
        self.http.assert_not_called()
        self.send.assert_not_called()

    def test_message_events_report_only_canonical_states(self):
        for event, expected in (("requests", "accepted"), ("sent", "accepted"),
                                ("delivered", "delivered"), ("soft_bounce", "deferred"),
                                ("hardBounce", "bounced"), ("blocked", "blocked"),
                                ("failed", "failed"), ("invalid_email", "failed"),
                                ("unsubscribed", "blocked"), ("spam", "blocked"),
                                (PRIVATE, "unknown"), ([], "unknown")):
            with self.subTest(expected=expected):
                self.http.side_effect = [*self._configuration_responses(), response({"events": [{
                    "messageId": MESSAGE_ID, "event": event, "email": PRIVATE,
                    "reason": PRIVATE, "subject": PRIVATE,
                }]})]
                output = self._run(message_id=MESSAGE_ID)
                self.assertIn(f"Brevo message events (newest first): {expected}.", output)
                self.assertIn("inbox delivery remains unverified", output)
                self.assertNotIn(PRIVATE, output)
                self.assertEqual(self.http.call_args.args[0], "https://api.brevo.com/v3/smtp/statistics/events")
                self.assertEqual(self.http.call_args.kwargs["params"], {
                    "messageId": MESSAGE_ID, "limit": 100, "sort": "desc",
                })
        self.send.assert_not_called()

    def test_events_from_other_messages_cannot_establish_delivery(self):
        self.http.side_effect = [*self._configuration_responses(), response({"events": [
            {"messageId": "<other@relay.example>", "event": "delivered", "email": PRIVATE},
            {"message-id": MESSAGE_ID, "event": "requests"},
        ]})]
        output = self._run(message_id=MESSAGE_ID)
        self.assertIn("Brevo message events (newest first): accepted.", output)
        self.assertNotIn("delivered", output)
        self.assertNotIn(PRIVATE, output)

    def test_no_matching_events_are_not_reported_as_delivery(self):
        for events in ([], [{"messageId": "<other@relay.example>", "event": "delivered"}]):
            with self.subTest(empty=not events):
                self.http.side_effect = [*self._configuration_responses(), response({"events": events})]
                output = self._run(message_id=MESSAGE_ID)
                self.assertIn("no matching events; delivery is unverified", output)
                self.assertNotIn("message events (newest first): delivered", output)
        self.send.assert_not_called()

    def test_matching_event_states_remain_in_provider_order_without_duplicate_categories(self):
        self.http.side_effect = [*self._configuration_responses(), response({"events": [
            {"messageId": MESSAGE_ID, "event": "delivered"},
            {"messageId": MESSAGE_ID, "event": "requests"},
            {"messageId": MESSAGE_ID, "event": "sent"},
        ]})]
        output = self._run(message_id=MESSAGE_ID)
        self.assertIn("Brevo message events (newest first): delivered, accepted.", output)

    def test_known_engagement_events_do_not_mask_delivery_history(self):
        self.http.side_effect = [*self._configuration_responses(), response({"events": [
            *({"messageId": MESSAGE_ID, "event": event} for event in ("opened", "clicks", "proxy", "firstOpening")),
            {"messageId": MESSAGE_ID, "event": "delivered"},
            {"messageId": MESSAGE_ID, "event": "requests"},
        ]})]
        output = self._run(message_id=MESSAGE_ID)
        self.assertIn("Brevo message events (newest first): delivered, accepted.", output)
        self.assertIn("checks passed", output)
        self.assertNotIn("unknown", output)
        self.send.assert_not_called()

    def test_engagement_only_or_truly_unknown_events_remain_unverified(self):
        cases = (
            ["opened", "clicks", "proxy", "firstOpening"],
            ["future_transport_event"],
            ["delivered", "future_transport_event"],
        )
        for names in cases:
            with self.subTest(names=names):
                self.http.side_effect = [*self._configuration_responses(), response({"events": [
                    {"messageId": MESSAGE_ID, "event": name} for name in names
                ]})]
                output = self._run(message_id=MESSAGE_ID)
                expected = "delivered, unknown" if names[0] == "delivered" else "unknown"
                self.assertIn(f"Brevo message events (newest first): {expected}.", output)
                self.assertIn("checks need attention", output)
                self.assertIn("inbox delivery remains unverified", output)
                self.assertNotIn("future_transport_event", output)
        self.send.assert_not_called()

    def test_disabled_or_unknown_relay_is_not_reported_as_healthy_configuration(self):
        for account, expected in (({"relay": {"enabled": False}}, "transactional relay is disabled"),
                                  ({}, "transactional relay status is unknown"),
                                  ({"relay": None}, "transactional relay status is unknown"),
                                  ({"relay": []}, "transactional relay status is unknown"),
                                  ({"relay": {"enabled": "false"}}, "transactional relay status is unknown")):
            with self.subTest(account=account):
                self.http.side_effect = [response(account), self._configuration_responses()[1]]
                output = self._run()
                self.assertIn(expected, output)
                self.assertIn("checks need attention", output)
                self.assertNotIn("transactional relay is enabled", output)
        self.send.assert_not_called()

    def test_event_lookup_failures_and_malformed_results_remain_safe(self):
        failures = (requests.ConnectionError(PRIVATE), response({"message": PRIVATE}, status=503),
                    response(invalid_json=True), response([]), response({"events": {}}),
                    response({"events": [None]}))
        for failure in failures:
            with self.subTest(failure_type=type(failure).__name__):
                self.http.side_effect = [*self._configuration_responses(), failure]
                output = self._run(message_id=MESSAGE_ID)
                self.assertIn("Brevo events:", output)
                self.assertIn("inbox delivery remains unverified", output)
                self.assertNotIn(PRIVATE, output)
        self.send.assert_not_called()

    @override_settings(BREVO_API_KEY="")
    def test_message_lookup_without_provider_configuration_sends_nothing(self):
        output = self._run(message_id=MESSAGE_ID)
        self.http.assert_not_called()
        self.send.assert_not_called()
        self.assertIn("events: unavailable without API configuration", output)
