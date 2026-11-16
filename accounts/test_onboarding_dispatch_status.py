"""Queued/accepted email evidence and recovery through existing admin APIs."""
from io import StringIO
from unittest.mock import Mock, patch

from django.core import mail
from django.core.management import call_command
from django.test import override_settings
from django.urls import reverse
from django.utils import timezone
from rest_framework.test import APITestCase

from accounts import onboarding
from accounts.models import CustomerOnboarding, EmailOTP, User
from common.test_utils import make_user
from orders.models import Order, OrderItem, OrderRecipient, Transaction
from profiles.models import Profile


@override_settings(ONBOARDING_EMAIL_SYNC=True, BREVO_API_KEY="", FRONTEND_URL="https://shop.example.com",
                   EMAIL_BACKEND="django.core.mail.backends.locmem.EmailBackend")
class OnboardingDispatchStatusTests(APITestCase):
    def setUp(self):
        self.admin = make_user("dispatch-admin@example.com", role=User.Role.ADMIN, is_staff=True)
        self.buyer = make_user("dispatch-buyer@example.com")
        self.user, _ = onboarding.provision_customer(email="dispatch-recipient@example.com", full_name="Recipient", phone="9876543210")
        self.order, self.slots = self.paid_order(self.user, ["REVIEW"])
        self.client.force_authenticate(self.admin)

    def paid_order(self, user, card_types):
        order = Order.objects.create(customer=self.buyer, amount="100.00", payment_method="RAZORPAY", payment_status="PAID")
        Transaction.objects.create(order=order, amount="100.00", method="RAZORPAY", status="PAID")
        rows = []
        for card_type in card_types:
            OrderItem.objects.create(order=order, product_id=f"FIXTURE-{card_type}", name="Card", card_type=card_type, color="Black", qty=1, price="100.00")
            rows.append(OrderRecipient.objects.create(order=order, user=user, profile=Profile.ensure_for_user(user),
                                                       card_type=card_type, name=user.full_name, email=user.email))
        return order, rows

    def status(self, order=None, value="PROCESSING"):
        with self.captureOnCommitCallbacks(execute=True):
            response = self.client.post(reverse("admin-order-status", args=[(order or self.order).pk]),
                                        {"status": value}, format="json")
        self.assertEqual(response.status_code, 200, response.content)
        return response

    def row(self, **params):
        response = self.client.get(reverse("admin-onboarding"), params)
        self.assertEqual(response.status_code, 200, response.content)
        return response.data["data"]

    @override_settings(ONBOARDING_EMAIL_SYNC=False)
    def test_queued_email_is_not_reported_as_sent_and_filter_matches_actual_state(self):
        with patch("accounts.onboarding.threading.Thread") as thread:
            response = self.status()
            recipient = response.data["data"]["recipients"][0]
            self.assertEqual(recipient["account_status"], "EMAIL_QUEUED")
            self.assertEqual(recipient["email_delivery_status"], "QUEUED")
            self.assertIsNone(recipient["invitation_sent_at"])
            self.assertFalse(recipient["email_delivery_verified"])
            self.assertEqual(self.row(activation="EMAIL_SENT"), [])
            self.assertEqual(len(self.row(activation="EMAIL_QUEUED")), 1)
            self.assertEqual(mail.outbox, [])
            # Execute the captured worker body without closing this test's connection.
            with patch("accounts.onboarding.connection.close"):
                thread.call_args.kwargs["target"]()
        accepted = self.row()[0]
        self.assertEqual(accepted["account_status"], "EMAIL_SENT")
        self.assertEqual(accepted["email_delivery_status"], "ACCEPTED")
        self.assertFalse(accepted["email_delivery_verified"])
        self.assertIn("unverified", accepted["account_status_display"])
        self.assertEqual(len(mail.outbox), 1)

    @override_settings(ONBOARDING_EMAIL_SYNC=False)
    def test_thread_start_failure_is_recorded_and_existing_retry_command_recovers(self):
        private = "private@example.com token=private-token"
        with patch("accounts.onboarding.threading.Thread") as thread, self.assertLogs("accounts.onboarding", "WARNING") as logs:
            thread.return_value.start.side_effect = RuntimeError(private)
            self.status()
        item = CustomerOnboarding.objects.get(user=self.user)
        self.assertEqual((item.email_status, item.email_last_error), ("FAILED", "RuntimeError"))
        self.assertEqual(item.account_status, "EMAIL_FAILED")
        self.assertNotIn(private, "\n".join(logs.output))
        self.assertEqual(self.row()[0]["email_delivery_status"], "FAILED")
        old_token = EmailOTP.objects.get(user=self.user, purpose=EmailOTP.Purpose.ACTIVATE)
        with self.captureOnCommitCallbacks(execute=True):
            call_command("retry_onboarding_emails", stdout=StringIO(), skip_checks=True)
        item.refresh_from_db()
        old_token.refresh_from_db()
        self.assertEqual(item.email_status, "SENT")
        self.assertTrue(old_token.is_used)
        self.assertEqual(len(mail.outbox), 1)

    @override_settings(ONBOARDING_EMAIL_SYNC=False)
    def test_unexpected_worker_exception_does_not_auto_retry_uncertain_acceptance(self):
        private = "private@example.com token=private-token"
        with patch("accounts.onboarding.threading.Thread") as thread:
            self.status()
            with patch("accounts.onboarding.CustomerOnboarding.objects.select_related", side_effect=RuntimeError(private)), \
                 patch("accounts.onboarding.connection.close"), self.assertLogs("accounts.onboarding", "WARNING") as logs:
                thread.call_args.kwargs["target"]()
        row = self.row()[0]
        self.assertEqual(row["email_status"], "PENDING")
        self.assertEqual(row["email_delivery_status"], "UNVERIFIED")
        self.assertEqual(row["email_last_error"], "dispatch_outcome_unknown")
        self.assertNotIn(private, "\n".join(logs.output))
        with patch("accounts.onboarding.reissue_and_send") as retry:
            call_command("retry_onboarding_emails", stdout=StringIO(), skip_checks=True)
        retry.assert_not_called()

    @override_settings(BREVO_API_KEY="offline-key", BREVO_SENDER_EMAIL="sender@example.test")
    def test_brevo_acceptance_does_not_become_verified_delivery(self):
        result = Mock(status_code=201)
        result.json.return_value = {"messageId": "<fixture@smtp-relay.example>"}
        with patch("accounts.emails.requests.post", return_value=result) as send, patch("requests.get") as events:
            self.status()
            row = self.row()[0]
        send.assert_called_once()
        events.assert_not_called()
        self.assertEqual(row["email_delivery_status"], "ACCEPTED")
        self.assertFalse(row["email_delivery_verified"])
        self.assertNotIn("delivered", row["email_delivery_status_display"].lower())

    @override_settings(BREVO_API_KEY="offline-key", BREVO_SENDER_EMAIL="sender@example.test")
    def test_provider_recipient_bounce_is_failed_without_automatic_retry(self):
        result = Mock(status_code=400)
        result.json.return_value = {"code": "recipient_bounced"}
        with patch("accounts.emails.requests.post", return_value=result) as send:
            self.status()
        row = self.row()[0]
        self.assertEqual(row["email_delivery_status"], "BOUNCED")
        self.assertEqual(row["account_status"], "EMAIL_FAILED")
        self.assertFalse(row["email_delivery_verified"])
        send.assert_called_once()
        with patch("accounts.onboarding.reissue_and_send") as retry:
            call_command("retry_onboarding_emails", stdout=StringIO(), skip_checks=True)
        retry.assert_not_called()

    @override_settings(ONBOARDING_EMAIL_SYNC=False)
    def test_reissue_clears_previous_acceptance_timestamp_while_new_link_is_queued(self):
        item = CustomerOnboarding.objects.get(user=self.user)
        item.credentials_issued_at = timezone.now()
        item.email_sent_at = timezone.now()
        item.email_status = "SENT"
        item.save(update_fields=["credentials_issued_at", "email_sent_at", "email_status"])
        with patch("accounts.onboarding.threading.Thread"), self.captureOnCommitCallbacks(execute=True):
            self.assertTrue(onboarding.reissue_and_send(self.user))
        item.refresh_from_db()
        self.assertEqual(item.account_status, "EMAIL_QUEUED")
        self.assertIsNone(item.email_sent_at)

    @override_settings(ONBOARDING_EMAIL_SYNC=False)
    def test_superseded_queued_worker_sends_only_the_current_activation_link(self):
        with patch("accounts.onboarding.threading.Thread") as thread:
            self.status()
            old_worker = thread.call_args.kwargs["target"]
            old_token = EmailOTP.objects.get(user=self.user, purpose=EmailOTP.Purpose.ACTIVATE)
            with self.captureOnCommitCallbacks(execute=True):
                self.assertTrue(onboarding.reissue_and_send(self.user))
            new_worker = thread.call_args.kwargs["target"]
            with patch("accounts.onboarding.connection.close"):
                old_worker()
                self.assertEqual(mail.outbox, [])
                item = CustomerOnboarding.objects.get(user=self.user)
                self.assertEqual((item.email_status, item.email_attempts), ("PENDING", 0))
                new_worker()
        old_token.refresh_from_db()
        self.assertTrue(old_token.is_used)
        current_token = EmailOTP.objects.get(user=self.user, purpose=EmailOTP.Purpose.ACTIVATE, is_used=False)
        self.assertEqual(len(mail.outbox), 1)
        self.assertIn(f"{current_token.pk}.", mail.outbox[0].body)
        self.assertNotIn(f"token={old_token.pk}.", mail.outbox[0].body)
        self.assertEqual(self.row()[0]["email_delivery_status"], "ACCEPTED")

    @override_settings(ONBOARDING_EMAIL_SYNC=False)
    def test_superseded_inflight_acceptance_cannot_mark_new_activation_as_sent(self):
        with patch("accounts.onboarding.threading.Thread") as thread:
            self.status()
            old_worker = thread.call_args.kwargs["target"]

            def accept_after_resend(*_args):
                with self.captureOnCommitCallbacks(execute=True):
                    self.assertTrue(onboarding.reissue_and_send(self.user))
                return True

            with patch("accounts.onboarding.connection.close"), patch("accounts.onboarding._send", side_effect=accept_after_resend) as send:
                old_worker()
            send.assert_called_once()
            item = CustomerOnboarding.objects.get(user=self.user)
            self.assertEqual(item.email_status, "PENDING")
            self.assertIsNone(item.email_sent_at)
            self.assertEqual(item.email_last_error, "")
            with patch("accounts.onboarding.connection.close"):
                thread.call_args.kwargs["target"]()
        self.assertEqual(len(mail.outbox), 1)
        self.assertEqual(self.row()[0]["email_delivery_status"], "ACCEPTED")

    @override_settings(ONBOARDING_EMAIL_SYNC=False)
    def test_superseded_failed_worker_stops_retries_without_failing_new_activation(self):
        with patch("accounts.onboarding.threading.Thread") as thread:
            self.status()
            old_worker = thread.call_args.kwargs["target"]

            def reject_after_resend(*_args):
                with self.captureOnCommitCallbacks(execute=True):
                    self.assertTrue(onboarding.reissue_and_send(self.user))
                return False

            with patch("accounts.onboarding.connection.close"), patch("accounts.onboarding.time.sleep"), \
                 patch("accounts.onboarding._send", side_effect=reject_after_resend) as send:
                old_worker()
            send.assert_called_once()
            item = CustomerOnboarding.objects.get(user=self.user)
            self.assertEqual((item.email_status, item.email_last_error), ("PENDING", ""))
            self.assertIsNone(item.email_sent_at)
            with patch("accounts.onboarding.connection.close"):
                thread.call_args.kwargs["target"]()
        self.assertEqual(len(mail.outbox), 1)
        self.assertEqual(self.row()[0]["email_delivery_status"], "ACCEPTED")

    def test_one_login_notice_updates_every_same_account_slot_and_is_not_sent_twice(self):
        active = make_user("active-dispatch@example.com")
        order, slots = self.paid_order(active, ["CUSTOM", "REVIEW"])
        self.status(order)
        notices = [message for message in mail.outbox if message.subject == onboarding.CARD_READY_SUBJECT]
        self.assertEqual(len(notices), 1)
        for slot in slots:
            slot.refresh_from_db()
            self.assertEqual(slot.invitation_status, "SENT")
            self.assertIsNotNone(slot.invitation_sent_at)
        self.assertTrue(onboarding.deliver_card_ready_email(slots[0].pk))
        self.assertEqual(len([m for m in mail.outbox if m.subject == onboarding.CARD_READY_SUBJECT]), 1)

    def test_failed_login_notice_releases_every_claim_and_later_processing_can_retry(self):
        active = make_user("active-failed-dispatch@example.com")
        order, slots = self.paid_order(active, ["CUSTOM", "REVIEW"])
        with patch("accounts.onboarding.send_email", return_value=False) as send:
            self.status(order)
        self.assertEqual(send.call_count, 3)
        for slot in slots:
            slot.refresh_from_db()
            self.assertEqual(slot.invitation_status, "FAILED")
            self.assertIsNone(slot.invitation_sent_at)
        self.status(order, "PENDING")
        self.status(order)
        self.assertEqual(len([m for m in mail.outbox if m.subject == onboarding.CARD_READY_SUBJECT]), 1)
        self.assertEqual(order.recipients.filter(invitation_status="SENT").count(), 2)
