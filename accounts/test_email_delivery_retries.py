"""Transport acceptance and retry rules, without real provider requests."""
from io import StringIO
from unittest import mock

from django.core.management import call_command
from django.test import SimpleTestCase, TestCase, override_settings
from django.utils import timezone

from accounts import onboarding
from accounts.emails import PermanentEmailDeliveryError
from accounts.models import CustomerOnboarding, EmailOTP
from common.test_utils import make_user
from orders.models import Order, OrderRecipient


class EmailTransportAcceptanceTests(SimpleTestCase):
    def test_smtp_success_requires_a_positive_send_count(self):
        with mock.patch("accounts.emails._email_connection_and_sender", return_value=(None, "sender@example.com")), \
                mock.patch("django.core.mail.EmailMultiAlternatives") as message_class:
            for count in (0, 1, 2):
                with self.subTest(count=count):
                    message_class.return_value.send.return_value = count
                    result = onboarding._send_via_django("recipient@example.com", "Subject", "<p>Body</p>", "Body")
                    self.assertEqual(result, count > 0)
                    message_class.return_value.send.assert_called_with(fail_silently=False)

    @override_settings(BREVO_API_KEY="offline-provider-key")
    def test_permanent_recipient_rejection_never_bypasses_to_smtp(self):
        for code in ("recipient_blocked", "recipient_bounced", "recipient_unsubscribed"):
            with self.subTest(code=code), \
                    mock.patch("accounts.emails.send_brevo_email", side_effect=PermanentEmailDeliveryError(code=code)) as brevo, \
                    mock.patch("accounts.onboarding.smtp_configured", return_value=True), \
                    mock.patch("accounts.onboarding._send_via_django") as smtp:
                with self.assertRaises(PermanentEmailDeliveryError):
                    onboarding.send_email("recipient@example.com", "Subject", "<p>Body</p>", "Body", "purpose=test")
                self.assertTrue(brevo.call_args.kwargs["raise_permanent"])
                smtp.assert_not_called()

    @override_settings(BREVO_API_KEY="offline-provider-key")
    def test_unclassified_provider_failure_keeps_existing_smtp_fallback(self):
        with mock.patch("accounts.emails.send_brevo_email", return_value=False), \
                mock.patch("accounts.onboarding.smtp_configured", return_value=True), \
                mock.patch("accounts.onboarding._send_via_django", return_value=True) as smtp:
            self.assertTrue(onboarding.send_email("recipient@example.com", "Subject", "<p>Body</p>", "Body", "purpose=test"))
            smtp.assert_called_once()


@override_settings(
    BREVO_API_KEY="offline-provider-key", ONBOARDING_EMAIL_SYNC=True,
    EMAIL_BACKEND="django.core.mail.backends.locmem.EmailBackend",
    PASSWORD_HASHERS=["django.contrib.auth.hashers.MD5PasswordHasher"],
)
class OnboardingEmailRetryTests(TestCase):
    def setUp(self):
        self.sequence = 0

    def _recipient(self, *, activated=False):
        self.sequence += 1
        buyer = make_user(email=f"buyer{self.sequence}@example.com")
        user, _ = onboarding.provision_customer(
            email=f"recipient{self.sequence}@example.com", full_name="Recipient", phone="9876543210",
        )
        if activated:
            user.must_change_password = False
            user.save(update_fields=["must_change_password"])
        order = Order.objects.create(customer=buyer, amount="999.00", payment_method="RAZORPAY", payment_status="PAID")
        allocation = OrderRecipient.objects.create(
            order=order, user=user, name="Recipient", email=user.email, invitation_sent_at=timezone.now(),
        )
        record = user.onboarding
        record.source_order = order
        record.save(update_fields=["source_order"])
        return user, record, allocation

    def _purchaser(self):
        self.sequence += 1
        user, _ = onboarding.provision_customer(
            email=f"purchaser{self.sequence}@example.com", full_name="Purchaser", phone="9876543210", create_profile=False,
        )
        Order.objects.create(customer=user, purchaser_email=user.email, amount="999.00", payment_method="RAZORPAY", payment_status="PAID")
        return user, EmailOTP.issue_purchaser_setup_link(user)

    def test_recipient_activation_permanent_rejection_stops_and_records_failure(self):
        for code in ("recipient_blocked", "recipient_bounced", "recipient_unsubscribed"):
            with self.subTest(code=code):
                _, record, allocation = self._recipient()
                with mock.patch("accounts.onboarding._send", side_effect=PermanentEmailDeliveryError(code=code)) as send:
                    self.assertFalse(onboarding.deliver_activation_email(record.pk, "offline-test-token"))
                record.refresh_from_db()
                allocation.order.refresh_from_db()
                self.assertEqual(send.call_count, 1)
                self.assertEqual((record.email_status, record.email_attempts, record.email_last_error), ("FAILED", 1, code))
                self.assertEqual(allocation.order.payment_status, "PAID")

    def test_card_ready_permanent_rejection_stops_and_records_failure(self):
        for code in ("recipient_blocked", "recipient_bounced", "recipient_unsubscribed"):
            with self.subTest(code=code):
                _, _, allocation = self._recipient(activated=True)
                with mock.patch("accounts.onboarding.send_email", side_effect=PermanentEmailDeliveryError(code=code)) as send:
                    self.assertFalse(onboarding.deliver_card_ready_email(allocation.pk))
                allocation.refresh_from_db()
                self.assertEqual(send.call_count, 1)
                self.assertEqual(allocation.invitation_status, "FAILED")
                self.assertIsNone(allocation.invitation_sent_at)

    def test_purchaser_setup_permanent_rejection_stops_without_new_tokens(self):
        for code in ("recipient_blocked", "recipient_bounced", "recipient_unsubscribed"):
            with self.subTest(code=code):
                user, token = self._purchaser()
                tokens = user.otps.count()
                with mock.patch("accounts.onboarding.send_email", side_effect=PermanentEmailDeliveryError(code=code)) as send:
                    self.assertFalse(onboarding.deliver_purchaser_setup_email(user.pk, token))
                self.assertEqual(send.call_count, 1)
                self.assertEqual(user.otps.count(), tokens)
                self.assertTrue(user.must_change_password)

    def test_recipient_activation_transient_failure_keeps_three_attempts(self):
        _, record, _ = self._recipient()
        with mock.patch("accounts.onboarding._send", side_effect=[False, False, True]) as send:
            self.assertTrue(onboarding.deliver_activation_email(record.pk, "offline-test-token"))
        record.refresh_from_db()
        self.assertEqual(send.call_count, 3)
        self.assertEqual((record.email_status, record.email_attempts, record.email_last_error), ("SENT", 3, ""))

    def test_card_ready_transient_failure_keeps_three_attempts(self):
        _, _, allocation = self._recipient(activated=True)
        with mock.patch("accounts.onboarding.send_email", side_effect=[False, False, True]) as send:
            self.assertTrue(onboarding.deliver_card_ready_email(allocation.pk))
        allocation.refresh_from_db()
        self.assertEqual(send.call_count, 3)
        self.assertEqual(allocation.invitation_status, "SENT")
        self.assertIsNotNone(allocation.invitation_sent_at)

    def test_purchaser_setup_transient_failure_keeps_three_attempts(self):
        user, token = self._purchaser()
        with mock.patch("accounts.onboarding.send_email", side_effect=[False, False, True]) as send:
            self.assertTrue(onboarding.deliver_purchaser_setup_email(user.pk, token))
        self.assertEqual(send.call_count, 3)

    def test_accepted_email_is_not_retried_in_any_onboarding_flow(self):
        _, record, _ = self._recipient()
        _, _, allocation = self._recipient(activated=True)
        user, token = self._purchaser()
        with mock.patch("accounts.onboarding.send_email", return_value=True) as send:
            self.assertTrue(onboarding.deliver_activation_email(record.pk, "offline-test-token"))
            self.assertTrue(onboarding.deliver_card_ready_email(allocation.pk))
            self.assertTrue(onboarding.deliver_purchaser_setup_email(user.pk, token))
        self.assertEqual(send.call_count, 3)

    def test_automatic_retry_command_skips_permanent_recipient_failures(self):
        transient_user = None
        for code in ("recipient_blocked", "recipient_bounced", "recipient_unsubscribed", "SMTPException"):
            user, record, _ = self._recipient()
            record.email_status = CustomerOnboarding.EmailStatus.FAILED
            record.email_last_error = code
            record.credentials_issued_at = timezone.now()
            record.save(update_fields=["email_status", "email_last_error", "credentials_issued_at"])
            if code == "SMTPException":
                transient_user = user
        with mock.patch("accounts.onboarding.reissue_and_send", return_value=True) as retry:
            call_command("retry_onboarding_emails", stdout=StringIO())
        retry.assert_called_once_with(transient_user, sync=True)

    def test_explicit_admin_resend_remains_available_after_permanent_failure(self):
        user, record, _ = self._recipient()
        record.email_status = CustomerOnboarding.EmailStatus.FAILED
        record.email_last_error = "recipient_blocked"
        record.credentials_issued_at = timezone.now()
        record.save(update_fields=["email_status", "email_last_error", "credentials_issued_at"])
        with mock.patch("accounts.onboarding._issue_and_dispatch") as dispatch:
            self.assertTrue(onboarding.reissue_and_send(user, sync=True))
        dispatch.assert_called_once()
