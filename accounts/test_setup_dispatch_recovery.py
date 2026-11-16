"""Setup delivery claims recover failures without inventing mailbox delivery."""
import re
from io import StringIO
from unittest.mock import patch

from django.core import mail
from django.core.management import call_command
from django.test import TestCase, override_settings

from accounts import onboarding
from accounts.emails import PermanentEmailDeliveryError
from accounts.models import CustomerOnboarding, EmailOTP
from orders.models import Order, OrderItem, OrderRecipient, Transaction
from payments.models import CheckoutSession


@override_settings(
    ONBOARDING_EMAIL_SYNC=True, BREVO_API_KEY="", FRONTEND_URL="https://shop.example.com",
    EMAIL_BACKEND="django.core.mail.backends.locmem.EmailBackend",
)
class SetupDispatchRecoveryTests(TestCase):
    def setUp(self):
        self.sequence = 0

    def purchase(self, *, card_type="CUSTOM", self_recipient=False):
        self.sequence += 1
        buyer, _ = onboarding.provision_customer(
            email=f"setup-buyer-{self.sequence}@example.com", full_name="Buyer", phone="9876543210",
            create_profile=False, email_verified=True,
        )
        order = Order.objects.create(
            customer=buyer, purchaser_email=buyer.email, amount="100.00",
            payment_method="RAZORPAY", payment_status="PAID",
        )
        Transaction.objects.create(order=order, amount="100.00", method="RAZORPAY", status="PAID")
        OrderItem.objects.create(
            order=order, product_id=f"CARD-{card_type}", name="Card", card_type=card_type,
            color="Black", qty=1, price="100.00",
        )
        if self_recipient:
            recipient = buyer
        else:
            recipient, _ = onboarding.provision_customer(
                email=f"setup-recipient-{self.sequence}@example.com", full_name="Recipient", phone="9876543211",
            )
        OrderRecipient.objects.create(
            order=order, user=recipient, card_type=card_type, name=recipient.full_name, email=recipient.email,
        )
        session = CheckoutSession.objects.create(
            customer=buyer, email=buyer.email, full_name=buyer.full_name, phone=buyer.phone,
            email_verified=True, subtotal="100.00", amount="100.00",
            status=CheckoutSession.Status.FULFILLED, order=order,
        )
        return buyer, recipient, order, session

    def start(self, order, session):
        with self.captureOnCommitCallbacks(execute=True):
            return onboarding.start_purchaser_setup(order, session)

    def purchaser_credential(self, user):
        return user.otps.filter(purpose=EmailOTP.Purpose.PURCHASER).latest("pk")

    def token(self, message):
        return re.search(r"[?&]token=([\w.\-]+)", message.body).group(1)

    def retry_command(self):
        with self.captureOnCommitCallbacks(execute=True):
            call_command("retry_onboarding_emails", stdout=StringIO(), skip_checks=True)

    def test_self_buyers_receive_purchaser_setup_immediately_for_each_product(self):
        for card_type in ("CUSTOM", "REVIEW"):
            with self.subTest(card_type=card_type):
                buyer, _, order, session = self.purchase(card_type=card_type, self_recipient=True)
                self.assertTrue(self.start(order, session))
                self.assertEqual(mail.outbox[-1].to, [buyer.email])
                self.assertIn("purpose=purchaser", mail.outbox[-1].body)
                record = self.purchaser_credential(buyer)
                self.assertEqual((record.email_status, record.email_attempts), ("SENT", 1))
                self.assertIsNotNone(record.email_sent_at)
                self.assertEqual(order.status, "PENDING")
                buyer.refresh_from_db()
                self.assertTrue(buyer.must_change_password)

    def test_failed_purchaser_delivery_can_retry_with_one_valid_replacement(self):
        buyer, _, order, session = self.purchase()
        attempted = []

        def reject(_email, _subject, _html, text, _context):
            attempted.append(re.search(r"[?&]token=([\w.\-]+)", text).group(1))
            return False

        with patch("accounts.onboarding.send_email", side_effect=reject):
            self.assertTrue(self.start(order, session))
        old = self.purchaser_credential(buyer)
        self.assertEqual((old.email_status, old.email_attempts), ("FAILED", 3))
        self.assertIsNone(old.email_sent_at)
        self.assertEqual(len(set(attempted)), 1, "transport retries reuse the same secure token")
        self.assertTrue(self.start(order, session))
        old.refresh_from_db()
        current = self.purchaser_credential(buyer)
        self.assertTrue(old.is_used)
        self.assertNotEqual(current.pk, old.pk)
        self.assertEqual(current.email_status, "SENT")
        self.assertEqual(buyer.otps.filter(purpose="PURCHASER", is_used=False).count(), 1)
        self.assertEqual(EmailOTP.check_activation_link(attempted[0], purpose="PURCHASER")[0], EmailOTP.LINK_USED)
        self.assertEqual(EmailOTP.check_activation_link(self.token(mail.outbox[-1]), purpose="PURCHASER")[0], EmailOTP.LINK_VALID)

    def test_purchaser_accepted_queued_legacy_and_uncertain_claims_suppress_auto_duplicates(self):
        for state, error in (("SENT", ""), ("PENDING", ""), ("", ""), ("PENDING", "dispatch_outcome_unknown")):
            with self.subTest(state=state, error=error):
                buyer, _, order, session = self.purchase()
                token = EmailOTP.issue_purchaser_setup_link(buyer)
                record = self.purchaser_credential(buyer)
                record.email_status, record.email_last_error = state, error
                record.save(update_fields=["email_status", "email_last_error"])
                with patch("accounts.onboarding.send_email") as send:
                    self.assertFalse(self.start(order, session))
                    self.retry_command()
                send.assert_not_called()
                self.assertEqual(buyer.otps.filter(purpose="PURCHASER").count(), 1)
                self.assertEqual(EmailOTP.check_activation_link(token, purpose="PURCHASER")[0], EmailOTP.LINK_VALID)

    def test_purchaser_permanent_rejection_is_recorded_and_never_automatically_retried(self):
        buyer, _, order, session = self.purchase()
        with patch("accounts.onboarding.send_email", side_effect=PermanentEmailDeliveryError("recipient_blocked")) as send:
            self.assertTrue(self.start(order, session))
            self.assertFalse(self.start(order, session))
            self.retry_command()
        send.assert_called_once()
        record = self.purchaser_credential(buyer)
        self.assertEqual((record.email_status, record.email_attempts, record.email_last_error), ("FAILED", 1, "recipient_blocked"))

    @override_settings(ONBOARDING_EMAIL_SYNC=False)
    def test_purchaser_thread_start_failure_is_recoverable_through_existing_command(self):
        buyer, _, order, session = self.purchase()
        with patch("accounts.onboarding.threading.Thread") as thread:
            thread.return_value.start.side_effect = RuntimeError("private@example.com token=private")
            with self.assertLogs("accounts.onboarding", "WARNING") as logs:
                self.assertTrue(self.start(order, session))
        record = self.purchaser_credential(buyer)
        self.assertEqual((record.email_status, record.email_last_error), ("FAILED", "RuntimeError"))
        self.assertNotIn("private@example.com", "\n".join(logs.output))
        self.assertEqual(mail.outbox, [])
        self.retry_command()
        record.refresh_from_db()
        self.assertTrue(record.is_used)
        self.assertEqual(self.purchaser_credential(buyer).email_status, "SENT")
        self.assertEqual(len(mail.outbox), 1)

    @override_settings(ONBOARDING_EMAIL_SYNC=False)
    def test_purchaser_unknown_worker_outcome_is_not_automatically_retried(self):
        buyer, _, order, session = self.purchase()
        with patch("accounts.onboarding.threading.Thread") as thread, \
                patch("accounts.onboarding.deliver_purchaser_setup_email", side_effect=RuntimeError("private token")):
            self.assertTrue(self.start(order, session))
            with patch("accounts.onboarding.connection.close"):
                thread.call_args.kwargs["target"]()
        record = self.purchaser_credential(buyer)
        self.assertEqual((record.email_status, record.email_last_error), ("PENDING", "dispatch_outcome_unknown"))
        with patch("accounts.onboarding.send_email") as send:
            self.retry_command()
        send.assert_not_called()

    def test_recipient_membership_preserves_purchaser_link_until_recipient_setup_explicitly_replaces_it(self):
        buyer, _, order, session = self.purchase()
        self.assertTrue(self.start(order, session))
        purchaser_token = self.token(mail.outbox[-1])
        OrderRecipient.objects.create(order=order, user=buyer, card_type="REVIEW", name=buyer.full_name, email=buyer.email)
        self.assertEqual(EmailOTP.check_activation_link(purchaser_token, purpose="PURCHASER")[0], EmailOTP.LINK_VALID)
        recipient_token = EmailOTP.issue_activation_link(buyer, lifetime_hours=1)
        self.assertEqual(EmailOTP.check_activation_link(purchaser_token, purpose="PURCHASER")[0], EmailOTP.LINK_USED)
        self.assertEqual(EmailOTP.check_activation_link(recipient_token)[0], EmailOTP.LINK_VALID)

    def test_existing_recipient_token_suppresses_later_automatic_purchaser_setup(self):
        buyer, _, order, session = self.purchase(self_recipient=True)
        token = EmailOTP.issue_activation_link(buyer, lifetime_hours=1)
        self.assertFalse(self.start(order, session))
        self.assertFalse(buyer.otps.filter(purpose="PURCHASER").exists())
        self.assertEqual(EmailOTP.check_activation_link(token)[0], EmailOTP.LINK_VALID)

    @override_settings(ONBOARDING_EMAIL_SYNC=False)
    def test_superseded_purchaser_worker_sends_no_invalid_link(self):
        buyer, _, order, session = self.purchase(self_recipient=True)
        with patch("accounts.onboarding.threading.Thread") as thread:
            self.assertTrue(self.start(order, session))
            purchaser_worker = thread.call_args.kwargs["target"]
            EmailOTP.issue_activation_link(buyer, lifetime_hours=1)
            with patch("accounts.onboarding.connection.close"):
                purchaser_worker()
        self.assertEqual(mail.outbox, [])

    def test_processing_can_recover_failed_recipient_email_for_both_products(self):
        for card_type in ("CUSTOM", "REVIEW"):
            with self.subTest(card_type=card_type):
                _, recipient, order, _ = self.purchase(card_type=card_type)
                with patch("accounts.onboarding.send_email", return_value=False):
                    with self.captureOnCommitCallbacks(execute=True):
                        onboarding.start_activation_for_order(order)
                record = CustomerOnboarding.objects.get(user=recipient)
                self.assertEqual(record.email_status, "FAILED")
                old = recipient.otps.get(purpose="ACTIVATE")
                with self.captureOnCommitCallbacks(execute=True):
                    onboarding.start_activation_for_order(order)
                record.refresh_from_db()
                old.refresh_from_db()
                self.assertTrue(old.is_used)
                self.assertEqual(record.email_status, "SENT")
                before = len(mail.outbox)
                with self.captureOnCommitCallbacks(execute=True):
                    onboarding.start_activation_for_order(order)
                self.assertEqual(len(mail.outbox), before)

    def test_activated_accounts_keep_existing_credentials_and_never_receive_setup(self):
        buyer, _, order, session = self.purchase()
        buyer.set_password("ExistingStrongPass123")
        buyer.must_change_password = False
        buyer.save(update_fields=["password", "must_change_password"])
        self.assertFalse(self.start(order, session))
        self.retry_command()
        buyer.refresh_from_db()
        self.assertTrue(buyer.check_password("ExistingStrongPass123"))
        self.assertEqual(mail.outbox, [])

    def test_retry_helper_does_not_issue_an_initial_purchaser_credential(self):
        buyer, _, _, _ = self.purchase()
        with self.captureOnCommitCallbacks(execute=True):
            self.assertFalse(onboarding.retry_purchaser_setup(buyer, sync=True))
        self.assertFalse(buyer.otps.filter(purpose="PURCHASER").exists())
        self.assertEqual(mail.outbox, [])

    def test_retry_command_ignores_superseded_failed_purchaser_evidence(self):
        buyer, _, order, session = self.purchase()
        with patch("accounts.onboarding.send_email", return_value=False):
            self.assertTrue(self.start(order, session))
        old = self.purchaser_credential(buyer)
        EmailOTP.issue_activation_link(buyer, lifetime_hours=1)
        self.retry_command()
        old.refresh_from_db()
        self.assertTrue(old.is_used)
        self.assertEqual(buyer.otps.filter(purpose="PURCHASER").count(), 1)
        self.assertEqual(mail.outbox, [])

    def test_recipient_email_uses_triggering_product_even_when_a_prior_order_is_the_source(self):
        for prior_type, current_type in (("REVIEW", "CUSTOM"), ("CUSTOM", "REVIEW")):
            for previously_recipient in (False, True):
                with self.subTest(prior_type=prior_type, current_type=current_type, previously_recipient=previously_recipient):
                    user, _, prior_order, _ = self.purchase(card_type=prior_type, self_recipient=previously_recipient)
                    CustomerOnboarding.objects.filter(user=user).update(source_order=prior_order)
                    _, _, current_order, _ = self.purchase(card_type=current_type)
                    current_order.recipients.update(user=user, email=user.email, name=user.full_name)
                    with self.captureOnCommitCallbacks(execute=True):
                        onboarding.start_activation_for_order(current_order)
                    record = CustomerOnboarding.objects.get(user=user)
                    self.assertEqual(record.source_order_id, current_order.pk)
                    self.assertEqual(mail.outbox[-1].to, [user.email])
                    self.assertIn(current_order.order_number, mail.outbox[-1].body)
                    if current_type == "REVIEW":
                        self.assertIn("Google Review workspace", mail.outbox[-1].body)
                        self.assertNotIn("manage your digital business profile", mail.outbox[-1].body)
                    else:
                        self.assertIn("manage your digital business profile", mail.outbox[-1].body)
                        self.assertNotIn("Google Review workspace", mail.outbox[-1].body)

    def recipient_worker_superseded_by_purchaser_recovery(self, *, accepted):
        buyer, _, order, _ = self.purchase(self_recipient=True)
        with patch("accounts.onboarding.threading.Thread") as thread:
            with self.captureOnCommitCallbacks(execute=True):
                onboarding.start_activation_for_order(order)
            old_worker = thread.call_args.kwargs["target"]
            activation = buyer.otps.get(purpose="ACTIVATE")

            def finish_after_purchaser_recovery(*_args):
                with self.captureOnCommitCallbacks(execute=True):
                    self.assertTrue(onboarding.request_purchaser_setup(buyer.email))
                return accepted

            with patch("accounts.onboarding.connection.close"), patch("accounts.onboarding.time.sleep"), \
                    patch("accounts.onboarding._send", side_effect=finish_after_purchaser_recovery) as send:
                old_worker()
            send.assert_called_once()
        activation.refresh_from_db()
        self.assertTrue(activation.is_used)
        purchaser = self.purchaser_credential(buyer)
        self.assertEqual(purchaser.email_status, "PENDING")
        self.assertFalse(purchaser.is_used)
        record = CustomerOnboarding.objects.get(user=buyer)
        self.assertEqual(record.email_status, "PENDING")
        self.assertEqual(record.email_attempts, 0)
        self.assertEqual(record.email_last_error, "")
        self.assertIsNone(record.email_sent_at)
        allocation = order.recipients.get()
        self.assertEqual(allocation.invitation_status, "PENDING")
        self.assertIsNone(allocation.invitation_sent_at)
        self.assertEqual(mail.outbox, [])

    @override_settings(ONBOARDING_EMAIL_SYNC=False)
    def test_inflight_recipient_acceptance_cannot_mark_superseded_link_as_sent(self):
        self.recipient_worker_superseded_by_purchaser_recovery(accepted=True)

    @override_settings(ONBOARDING_EMAIL_SYNC=False)
    def test_inflight_recipient_failure_cannot_overwrite_new_purchaser_recovery(self):
        self.recipient_worker_superseded_by_purchaser_recovery(accepted=False)
