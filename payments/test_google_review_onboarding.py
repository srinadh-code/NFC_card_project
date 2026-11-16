"""Google Review uses the existing paid-order, Processing and account flows."""
from datetime import timedelta
from unittest import mock

from django.core import mail
from django.test import override_settings
from django.urls import reverse
from django.utils import timezone
from rest_framework.test import APITestCase

from accounts import onboarding
from accounts.models import CustomerOnboarding, EmailOTP, User
from common.test_utils import make_user
from nfc_cards.models import NfcCard
from orders.models import Order
from payments import test_purchaser_setup as fixtures
from payments.tests import _guest_payload
from profiles.models import Profile
from website_content.models import OrderCardProduct


PASSWORD = fixtures.PASSWORD


@override_settings(**fixtures.PurchaserSetupTests._overridden_settings)
class GoogleReviewOnboardingTests(APITestCase):
    _fake_create_order = fixtures.PurchaserSetupTests._fake_create_order
    _with_token = fixtures.PurchaserSetupTests._with_token
    _checkout = fixtures.PurchaserSetupTests._checkout
    _verify = fixtures.PurchaserSetupTests._verify
    _webhook = fixtures.PurchaserSetupTests._webhook
    _email_token = fixtures.PurchaserSetupTests._email_token
    _pay = fixtures.PurchaserSetupTests._pay
    _setup_messages = fixtures.PurchaserSetupTests._setup_messages
    _recipient_messages = fixtures.PurchaserSetupTests._recipient_messages
    _token = fixtures.PurchaserSetupTests._token
    _check = fixtures.PurchaserSetupTests._check
    _complete = fixtures.PurchaserSetupTests._complete

    def setUp(self):
        fixtures.PurchaserSetupTests.setUp(self)
        OrderCardProduct.objects.update_or_create(slug="google-review", defaults={
            "name": "Google Review Card", "price": "499.00", "card_type": "REVIEW",
            "is_active": True, "is_published": True,
        })
        self.admin = make_user("review-onboarding-admin@example.com", role=User.Role.ADMIN, is_staff=True)

    def checkout(self, emails, buyer="review-buyer@example.com"):
        payload = _guest_payload(email=buyer, product_id="PRD-NEXORA-GOOGLE-REVIEW", qty=len(emails))
        payload["recipients"] = [fixtures.recipient(email, f"Review recipient {index}") for index, email in enumerate(emails)]
        return self._checkout(payload)

    def buy(self, emails, buyer="review-buyer@example.com"):
        checkout = self.checkout(emails, buyer)
        response, order = self._pay(checkout)
        return checkout, response, order

    def status(self, order, value="PROCESSING", expected=200):
        self.client.force_authenticate(self.admin)
        with self.captureOnCommitCallbacks(execute=True):
            response = self.client.post(reverse("admin-order-status", args=[order.pk]), {"status": value}, format="json")
        self.client.force_authenticate(None)
        self.assertEqual(response.status_code, expected, response.content)
        return response

    def ready_messages(self, email):
        return [message for message in mail.outbox if message.subject == onboarding.CARD_READY_SUBJECT and message.to == [email]]

    def test_buying_for_others_sends_purchaser_setup_after_payment_and_recipient_links_only_at_processing(self):
        checkout = self.checkout(["review-one@example.com", "review-two@example.com"])
        self.assertEqual(self._setup_messages(), [])
        self.assertEqual(self._recipient_messages(), [])
        _, order = self._pay(checkout)
        self.assertEqual(order.status, Order.Status.PENDING)
        self.assertEqual([message.to for message in self._setup_messages()], [["review-buyer@example.com"]])
        self.assertEqual(self._recipient_messages(), [])
        self.assertFalse(Profile.objects.filter(user=order.customer).exists())
        self.assertFalse(EmailOTP.objects.filter(user=order.customer, purpose=EmailOTP.Purpose.ACTIVATE).exists())
        self.status(order)
        messages = self._recipient_messages()
        self.assertCountEqual([message.to[0] for message in messages], ["review-one@example.com", "review-two@example.com"])
        for message in messages:
            self.assertIn("Google Review workspace", message.body)
            self.assertNotIn("digital business profile", message.body)
            self.assertNotIn("designer", message.body)
            self.assertIn("Username:", message.body)
            self.assertIn("https://shop.example.com/set-password", message.body)
            self.assertNotIn(PASSWORD, message.body)
        self.assertEqual(NfcCard.objects.count(), 0)

    def test_self_purchase_has_one_recipient_account_and_no_competing_purchaser_setup(self):
        _, paid, order = self.buy(["review-buyer@example.com"])
        self.assertEqual(paid.data["data"]["purchaser_setup"], "recipient")
        self.assertEqual(self._setup_messages(), [])
        self.assertEqual(self._recipient_messages(), [])
        self.assertEqual(order.recipients.get().user_id, order.customer_id)
        self.status(order)
        messages = self._recipient_messages()
        self.assertEqual([message.to for message in messages], [["review-buyer@example.com"]])
        token = self._token(messages[0])
        otp = EmailOTP.objects.get(user=order.customer, purpose=EmailOTP.Purpose.ACTIVATE)
        self.assertNotEqual(otp.code_hash, token)
        self.assertLessEqual((otp.expires_at - otp.created_at).total_seconds(), 48 * 3600)
        self.assertEqual(self._complete(token, purpose="recipient").status_code, 200)
        self.assertNotEqual(self._complete(token, purpose="recipient").status_code, 200)
        login = self.client.post(reverse("auth-login"), {"email": order.customer.email, "password": PASSWORD}, format="json")
        self.assertEqual(login.status_code, 200, login.content)
        workspace = self.client.get(reverse("customer-google-review"), HTTP_AUTHORIZATION=f"Bearer {login.data['data']['access']}")
        self.assertTrue(workspace.data["data"]["eligible"])
        self.assertFalse(workspace.data["data"]["digital_access"])
        self.assertEqual(User.objects.filter(email=order.customer.email).count(), 1)

    def test_self_and_others_receive_one_email_each_and_processing_replays_do_not_duplicate(self):
        emails = ["review-buyer@example.com", "review-one@example.com", "review-two@example.com"]
        _, _, order = self.buy(emails)
        self.assertEqual(self._setup_messages(), [])
        self.status(order)
        self.assertCountEqual([message.to[0] for message in self._recipient_messages()], emails)
        token_count = EmailOTP.objects.filter(purpose=EmailOTP.Purpose.ACTIVATE).count()
        self.status(order)
        self.status(order, "PENDING")
        self.status(order)
        self.assertEqual(len(self._recipient_messages()), 3)
        self.assertEqual(EmailOTP.objects.filter(purpose=EmailOTP.Purpose.ACTIVATE).count(), token_count)
        self.assertFalse(EmailOTP.objects.filter(user=order.customer, purpose=EmailOTP.Purpose.PURCHASER).exists())

    def test_existing_recipient_keeps_password_and_gets_only_a_login_notice(self):
        user = make_user("existing-review@example.com", password=PASSWORD)
        password_hash = user.password
        _, _, order = self.buy([user.email])
        self.status(order)
        self.assertEqual(self._recipient_messages(), [])
        notices = self.ready_messages(user.email)
        self.assertEqual(len(notices), 1)
        self.assertIn("Google Review workspace", notices[0].body)
        self.assertIn("/login", notices[0].body)
        self.assertNotIn("token=", notices[0].body)
        self.assertNotIn("digital business profile", notices[0].body)
        user.refresh_from_db()
        self.assertEqual(user.password, password_hash)
        self.assertEqual(User.objects.filter(email=user.email).count(), 1)
        self.status(order, "PENDING")
        self.status(order)
        self.assertEqual(len(self.ready_messages(user.email)), 1)

    def test_existing_digital_customer_receives_review_without_profile_or_password_changes(self):
        user = make_user("existing-digital@example.com", password=PASSWORD)
        profile = Profile.ensure_for_user(user)
        profile.selected_template, profile.company = "future", "Original company"
        profile.save(update_fields=["selected_template", "company"])
        digital_card = NfcCard.objects.create(uid="ORIGINAL-DIGITAL", serial_number="ORIGINAL-DIGITAL-SN", user=user, status="ACTIVE")
        password_hash = user.password
        _, _, order = self.buy([user.email], buyer=user.email)
        self.assertEqual(self._setup_messages(), [])
        self.status(order)
        self.assertEqual(self._recipient_messages(), [])
        self.assertEqual(len(self.ready_messages(user.email)), 1)
        user.refresh_from_db()
        profile.refresh_from_db()
        digital_card.refresh_from_db()
        self.assertEqual(user.password, password_hash)
        self.assertEqual((profile.selected_template, profile.company), ("future", "Original company"))
        self.assertEqual((digital_card.user_id, digital_card.status), (user.pk, "ACTIVE"))
        self.client.force_authenticate(user)
        workspace = self.client.get(reverse("customer-google-review"))
        self.assertTrue(workspace.data["data"]["eligible"])
        self.assertTrue(workspace.data["data"]["digital_access"])

    def test_failed_or_invalid_signature_payment_creates_no_account_or_setup_email(self):
        checkout = self.checkout(["review-one@example.com"])
        with self.captureOnCommitCallbacks(execute=True):
            bad = self._verify(checkout, signature="invalid")
            failed = self._webhook("payment.failed", checkout["razorpay_order_id"], checkout["amount"])
        self.assertEqual(bad.status_code, 400)
        self.assertEqual(failed.status_code, 200)
        self.assertFalse(Order.objects.exists())
        self.assertFalse(User.objects.filter(email__in=["review-buyer@example.com", "review-one@example.com"]).exists())
        self.assertEqual(self._setup_messages(), [])
        self.assertEqual(self._recipient_messages(), [])

    def test_processing_requires_successful_payment_ledger_before_review_activation(self):
        _, _, order = self.buy(["review-one@example.com"])
        order.transactions.all().delete()
        response = self.status(order, expected=400)
        self.assertEqual(response.data["errors"]["code"], "payment_required")
        self.assertEqual(self._recipient_messages(), [])
        self.assertFalse(EmailOTP.objects.filter(purpose=EmailOTP.Purpose.ACTIVATE).exists())

    def test_review_activation_delivery_retains_three_transient_attempts(self):
        _, _, order = self.buy(["review-one@example.com"])
        with mock.patch("accounts.onboarding._send_via_django", side_effect=[False, False, True]) as transport:
            self.status(order)
        user = order.recipients.get().user
        record = CustomerOnboarding.objects.get(user=user)
        self.assertEqual(transport.call_count, 3)
        self.assertEqual((record.email_status, record.email_attempts), ("SENT", 3))
        self.assertIn("Google Review workspace", transport.call_args.args[3])
        self.assertEqual(EmailOTP.objects.filter(user=user, purpose=EmailOTP.Purpose.ACTIVATE).count(), 1)

    def test_review_recipient_expired_and_wrong_purpose_links_are_rejected_then_admin_resend_recovers(self):
        _, _, order = self.buy(["review-one@example.com"])
        self.status(order)
        message = self._recipient_messages()[0]
        token = self._token(message)
        self.assertNotEqual(self._complete(token, purpose="purchaser").status_code, 200)
        user = order.recipients.get().user
        EmailOTP.objects.filter(user=user, purpose=EmailOTP.Purpose.ACTIVATE).update(expires_at=timezone.now() - timedelta(seconds=1))
        self.assertNotEqual(self._complete(token, purpose="recipient").status_code, 200)
        self.client.force_authenticate(self.admin)
        with self.captureOnCommitCallbacks(execute=True):
            resent = self.client.post(reverse("admin-onboarding-resend", args=[user.onboarding.pk]), {}, format="json")
        self.client.force_authenticate(None)
        self.assertEqual(resent.status_code, 200, resent.content)
        fresh_token = self._token(self._recipient_messages()[-1])
        self.assertNotEqual(fresh_token, token)
        self.assertEqual(self._complete(fresh_token, purpose="recipient").status_code, 200)

    def test_pending_purchaser_later_receiving_review_uses_only_the_recipient_activation_path(self):
        self.buy(["review-one@example.com"])
        purchaser_token = self._token(self._setup_messages()[0])
        _, _, self_order = self.buy(["review-buyer@example.com"])
        self.assertNotEqual(self._complete(purchaser_token).status_code, 200)
        self.status(self_order)
        messages = [message for message in self._recipient_messages() if message.to == ["review-buyer@example.com"]]
        self.assertEqual(len(messages), 1)
        self.assertEqual(len(self._setup_messages()), 1)
        self.assertEqual(self._complete(self._token(messages[0]), purpose="recipient").status_code, 200)
        self.assertEqual(User.objects.filter(email="review-buyer@example.com").count(), 1)
