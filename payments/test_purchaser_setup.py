"""Paid purchaser login setup stays separate from NFC recipient activation."""

import re
from datetime import timedelta
from unittest import mock

from django.core import mail
from django.core.cache import cache
from django.db import transaction
from django.test import override_settings
from django.urls import reverse
from django.utils import timezone
from rest_framework.test import APITestCase

from accounts import onboarding
from accounts.models import CustomerOnboarding, EmailOTP, User
from common.test_utils import make_user, patch_pincode_directory
from nfc_cards.models import NfcCard
from orders.models import Order
from payments import tests as payment_fixtures
from payments.models import CheckoutVerification
from payments.tests import KEY_SECRET, WEBHOOK_SECRET, _guest_payload
from profiles.models import Profile
from website_content.models import OrderCardProduct


PASSWORD = "MyPass@123"
SETUP_SUBJECT = "Set Up Your VR's Gateway Account"


def recipient(email, name="Recipient"):
    return {"full_name": name, "email": email, "phone": "+917700900123"}


@override_settings(
    RAZORPAY_KEY_ID="rzp_test_key",
    RAZORPAY_KEY_SECRET=KEY_SECRET,
    RAZORPAY_WEBHOOK_SECRET=WEBHOOK_SECRET,
    DUMMY_PAYMENTS_ENABLED=True,
    ONBOARDING_EMAIL_SYNC=True,
    BREVO_API_KEY="",
    EMAIL_BACKEND="django.core.mail.backends.locmem.EmailBackend",
    FRONTEND_URL="https://shop.example.com",
    PASSWORD_HASHERS=["django.contrib.auth.hashers.MD5PasswordHasher"],
)
class PurchaserSetupTests(APITestCase):
    # Reuse the real payment signatures and mocked provider fixture without
    # inheriting its tests or its eager on_commit patch.
    _fake_create_order = payment_fixtures.RazorpayOnboardingTests._fake_create_order
    _with_token = payment_fixtures.RazorpayOnboardingTests._with_token
    _checkout = payment_fixtures.RazorpayOnboardingTests._checkout
    _verify = payment_fixtures.RazorpayOnboardingTests._verify
    _webhook = payment_fixtures.RazorpayOnboardingTests._webhook

    def setUp(self):
        patch_pincode_directory(self)
        self.addCleanup(cache.clear)
        OrderCardProduct.objects.update_or_create(
            slug="custom",
            defaults={
                "name": "GATEWAY Custom", "price": "999.00", "card_type": "CUSTOM",
                "is_active": True, "is_published": True,
            },
        )
        self._order_seq = 0
        patcher = mock.patch("payments.razorpay.create_order", side_effect=self._fake_create_order)
        self.create_order = patcher.start()
        self.addCleanup(patcher.stop)

    def _email_token(self, email):
        previous_messages = len(mail.outbox)
        sent = self.client.post(
            reverse("checkout-otp-send"), {"channel": "EMAIL", "destination": email}, format="json",
        )
        self.assertEqual(sent.status_code, 200, sent.content)
        code = re.search(r"verification code is:\s+(\d{6})", mail.outbox[-1].body).group(1)
        verified = self.client.post(
            reverse("checkout-otp-verify"),
            {"channel": "EMAIL", "destination": email, "code": code}, format="json",
        )
        self.assertEqual(verified.status_code, 200, verified.content)
        del mail.outbox[previous_messages:]
        CheckoutVerification.objects.update(created_at=timezone.now() - timedelta(minutes=2))
        return verified.data["data"]["verification_token"]

    def _start(self, emails=None, *, email="srinadh@example.com", name="Srinadh", provider="razorpay"):
        emails = emails or ["kavya@example.com", "lakshmi@example.com", "deepika@example.com"]
        payload = _guest_payload(email=email, qty=len(emails))
        payload["contact"]["full_name"] = name
        payload["recipients"] = [recipient(value) for value in emails]
        payload["provider"] = provider
        return self._checkout(payload)

    def _pay(self, checkout):
        with self.captureOnCommitCallbacks(execute=True):
            if checkout["provider"] == "DUMMY":
                response = self.client.post(
                    reverse("dummy-payment-confirm"),
                    {"checkout_id": checkout["checkout_id"], "amount": checkout["amount"]}, format="json",
                )
            else:
                response = self._verify(checkout, payment_id=f"pay_{self._order_seq}")
        self.assertEqual(response.status_code, 200, response.content)
        return response, Order.objects.get(pk=response.data["data"]["order_id"])

    def _buy(self, emails=None, **kwargs):
        checkout = self._start(emails, **kwargs)
        response, order = self._pay(checkout)
        return checkout, response, order

    def _setup_messages(self):
        return [message for message in mail.outbox if message.subject == SETUP_SUBJECT]

    def _recipient_messages(self):
        return [message for message in mail.outbox if message.subject == onboarding.ACTIVATION_SUBJECT]

    def _token(self, message=None):
        message = message or self._setup_messages()[-1]
        match = re.search(r"[?&]token=([\w.\-]+)", message.body)
        self.assertIsNotNone(match, "setup email includes its secure password link")
        return match.group(1)

    def _check(self, token, purpose="purchaser"):
        return self.client.post(
            reverse("auth-activation-check"), {"token": token, "purpose": purpose}, format="json",
        )

    def _complete(self, token, purpose="purchaser", password=PASSWORD, **extra):
        return self.client.post(
            reverse("auth-activation-complete"),
            {"token": token, "purpose": purpose, "new_password": password, "confirm_password": password, **extra},
            format="json",
        )

    def _processing(self, order):
        admin = make_user(email=f"admin{order.pk}@example.com", role=User.Role.ADMIN, is_staff=True)
        self.client.force_authenticate(admin)
        with self.captureOnCommitCallbacks(execute=True):
            response = self.client.post(
                reverse("admin-order-status", args=[order.pk]), {"status": "PROCESSING"}, format="json",
            )
        self.client.force_authenticate(None)
        self.assertEqual(response.status_code, 200, response.content)
        return response

    def _request_setup(self, email):
        with self.captureOnCommitCallbacks(execute=True):
            return self.client.post(reverse("auth-purchaser-setup-request"), {"email": email}, format="json")

    def test_verified_payment_queues_setup_until_commit_without_creating_profile_or_card(self):
        checkout = self._start()
        self.assertEqual(self._setup_messages(), [])
        with self.captureOnCommitCallbacks(execute=False) as callbacks:
            paid = self._verify(checkout)
            self.assertEqual(paid.status_code, 200, paid.content)
            self.assertEqual(self._setup_messages(), [])
            self.assertNotIn("token", paid.data["data"])
        for callback in callbacks:
            callback()

        messages = self._setup_messages()
        self.assertEqual([message.to for message in messages], [["srinadh@example.com"]])
        self.assertIn("purpose=purchaser", messages[0].body)
        self.assertIn("My Orders", messages[0].body)
        order = Order.objects.get(pk=paid.data["data"]["order_id"])
        self.assertEqual(order.customer.email, "srinadh@example.com")
        self.assertFalse(Profile.objects.filter(user=order.customer).exists())
        self.assertFalse(NfcCard.objects.exists())
        self.assertEqual(order.recipients.count(), 3)
        self.assertEqual(self._recipient_messages(), [])
        otp = EmailOTP.objects.get(user=order.customer, purpose=EmailOTP.Purpose.PURCHASER)
        self.assertNotEqual(otp.code_hash, self._token())
        self.assertLessEqual((otp.expires_at - otp.created_at).total_seconds(), 60 * 60)
        self.assertEqual(paid.data["data"]["purchaser_setup"], "required")

    def test_rollback_drops_setup_dispatch_and_order(self):
        checkout = self._start()
        with self.captureOnCommitCallbacks(execute=True):
            with self.assertRaisesRegex(RuntimeError, "rollback fixture"):
                with transaction.atomic():
                    paid = self._verify(checkout)
                    self.assertEqual(paid.status_code, 200, paid.content)
                    raise RuntimeError("rollback fixture")
        self.assertFalse(Order.objects.exists())
        self.assertFalse(User.objects.filter(email="srinadh@example.com").exists())
        self.assertEqual(self._setup_messages(), [])

    def test_pending_failed_and_bad_signature_payments_do_not_send_setup(self):
        checkout = self._start()
        self.assertFalse(Order.objects.exists())
        self.assertFalse(EmailOTP.objects.filter(purpose=EmailOTP.Purpose.PURCHASER).exists())
        with self.captureOnCommitCallbacks(execute=True):
            invalid = self._verify(checkout, signature="invalid-signature")
            failed = self._webhook("payment.failed", checkout["razorpay_order_id"], checkout["amount"])
        self.assertEqual(invalid.status_code, 400)
        self.assertEqual(failed.status_code, 200)
        self.assertFalse(Order.objects.exists())
        self.assertEqual(self._setup_messages(), [])

    def test_setup_allows_normal_login_and_owner_only_history_without_profile(self):
        _, _, order = self._buy()
        token = self._token()
        checked = self._check(token)
        self.assertEqual(checked.status_code, 200, checked.content)
        self.assertEqual(checked.data["data"]["email"], "srinadh@example.com")
        self.assertEqual(checked.data["data"]["purpose"], "purchaser")
        self.assertEqual(self._complete(token).status_code, 200)
        user = order.customer
        user.refresh_from_db()
        self.assertFalse(user.must_change_password)
        self.assertTrue(user.email_verified)
        self.assertTrue(user.check_password(PASSWORD))
        self.assertNotEqual(user.password, PASSWORD)
        login = self.client.post(
            reverse("auth-login"), {"email": "srinadh@example.com", "password": PASSWORD}, format="json",
        )
        self.assertEqual(login.status_code, 200, login.content)
        access = login.data["data"]["access"]
        history = self.client.get(reverse("my-orders"), HTTP_AUTHORIZATION=f"Bearer {access}")
        self.assertEqual(history.status_code, 200, history.content)
        self.assertEqual([entry["id"] for entry in history.data["data"]], [order.pk])
        self.assertEqual(self.client.get(reverse("my-order-detail", args=[order.pk]), HTTP_AUTHORIZATION=f"Bearer {access}").status_code, 200)
        other = make_user(email="unrelated@example.com")
        self.client.force_authenticate(other)
        self.assertEqual(self.client.get(reverse("my-orders")).data["data"], [])
        self.assertEqual(self.client.get(reverse("my-order-detail", args=[order.pk])).status_code, 404)
        self.client.force_authenticate(order.recipients.first().user)
        self.assertEqual(self.client.get(reverse("my-orders")).data["data"], [])
        self.assertEqual(self.client.get(reverse("my-order-detail", args=[order.pk])).status_code, 404)
        self.assertFalse(Profile.objects.filter(user=user).exists())
        self.assertFalse(NfcCard.objects.filter(user=user).exists())

    def test_existing_password_and_checkout_name_snapshots_are_preserved(self):
        user = make_user(email="srinadh@example.com", password=PASSWORD, full_name="Original Account Name")
        old_hash = user.password
        _, _, first = self._buy(["first@example.com"], name="Srinadh")
        _, _, second = self._buy(["second@example.com"], name="Vinay")
        self.assertEqual((first.customer_id, second.customer_id), (user.pk, user.pk))
        self.assertEqual((first.purchaser_name, second.purchaser_name), ("Srinadh", "Vinay"))
        self.assertNotEqual(first.pk, second.pk)
        user.refresh_from_db()
        self.assertEqual((user.password, user.full_name), (old_hash, "Original Account Name"))
        self.assertEqual(User.objects.filter(email="srinadh@example.com").count(), 1)
        self.assertEqual(self._setup_messages(), [])
        self.client.force_authenticate(user)
        self.assertCountEqual([entry["id"] for entry in self.client.get(reverse("my-orders")).data["data"]], [first.pk, second.pk])

    def test_self_recipient_keeps_one_existing_processing_activation_path(self):
        _, paid, order = self._buy(["srinadh@example.com"])
        self.assertEqual(paid.data["data"]["purchaser_setup"], "recipient")
        self.assertEqual(self._setup_messages(), [])
        self.assertEqual(self._recipient_messages(), [])
        self.assertEqual(order.recipients.get().user_id, order.customer_id)
        self._processing(order)
        self.assertEqual([message.to for message in self._recipient_messages()], [["srinadh@example.com"]])
        self.assertEqual(self._complete(self._token(self._recipient_messages()[0]), purpose="recipient").status_code, 200)
        self.assertEqual(Profile.objects.filter(user=order.customer).count(), 1)
        self.assertEqual(self._setup_messages(), [])

    def test_recipients_receive_only_their_existing_recipient_account_ready_emails(self):
        _, _, order = self._buy()
        purchaser_record = CustomerOnboarding.objects.get(user=order.customer)
        self.assertIsNone(purchaser_record.credentials_issued_at)
        self._processing(order)
        self.assertCountEqual([message.to[0] for message in self._recipient_messages()], ["kavya@example.com", "lakshmi@example.com", "deepika@example.com"])
        self.assertEqual([message.to for message in self._setup_messages()], [["srinadh@example.com"]])
        self.assertEqual(EmailOTP.objects.filter(purpose=EmailOTP.Purpose.ACTIVATE).count(), 3)
        purchaser_record.refresh_from_db()
        self.assertIsNone(purchaser_record.credentials_issued_at)
        self.assertEqual(purchaser_record.email_attempts, 0)

    def test_completed_purchaser_later_buys_self_with_same_account_and_separate_orders(self):
        _, _, first = self._buy(["other@example.com"])
        self.assertEqual(self._complete(self._token()).status_code, 200)
        _, second_result, second = self._buy(["srinadh@example.com"])
        self.assertEqual(first.customer_id, second.customer_id)
        self.assertEqual(second.recipients.get().user_id, first.customer_id)
        self.assertEqual(second_result.data["data"]["purchaser_setup"], "active")
        self._processing(second)
        self.assertEqual(len(self._setup_messages()), 1)
        self.assertEqual(self._recipient_messages(), [])
        self.assertEqual(User.objects.filter(email="srinadh@example.com").count(), 1)
        self.assertEqual(Profile.objects.filter(user=first.customer).count(), 1)
        self.client.force_authenticate(first.customer)
        self.assertCountEqual([entry["id"] for entry in self.client.get(reverse("my-orders")).data["data"]], [first.pk, second.pk])

    def test_pending_purchaser_becoming_recipient_has_no_competing_valid_setup_paths(self):
        _, _, first = self._buy(["other@example.com"])
        purchaser_token = self._token()
        _, _, second = self._buy(["srinadh@example.com"])
        self.assertEqual(first.customer_id, second.customer_id)
        self.assertEqual(len(self._setup_messages()), 1)
        self._processing(second)
        recipient_messages = [message for message in self._recipient_messages() if message.to == ["srinadh@example.com"]]
        valid_paths = int(self._check(purchaser_token).status_code == 200)
        for message in recipient_messages:
            valid_paths += int(self._check(self._token(message), purpose="recipient").status_code == 200)
        self.assertEqual(valid_paths, 1)
        self.assertEqual(User.objects.filter(email="srinadh@example.com").count(), 1)
        self.assertEqual(Profile.objects.filter(user=first.customer).count(), 1)

    def test_duplicate_verify_webhook_and_second_paid_order_do_not_repeat_setup_email(self):
        checkout, _, order = self._buy(["first@example.com"])
        for _ in range(2):
            with self.captureOnCommitCallbacks(execute=True):
                again = self._verify(checkout, payment_id="pay_1")
                webhook = self._webhook("payment.captured", checkout["razorpay_order_id"], checkout["amount"], payment_id="pay_1")
            self.assertEqual(again.status_code, 200)
            self.assertEqual(again.data["data"]["order_id"], order.pk)
            self.assertEqual(webhook.status_code, 200)
        _, _, second = self._buy(["second@example.com"])
        self.assertEqual(second.customer_id, order.customer_id)
        self.assertEqual(len(self._setup_messages()), 1)
        self.assertEqual(EmailOTP.objects.filter(user=order.customer, purpose=EmailOTP.Purpose.PURCHASER).count(), 1)

    def test_signed_webhook_can_send_first_setup_and_browser_verification_is_idempotent(self):
        checkout = self._start(["other@example.com"])
        with self.captureOnCommitCallbacks(execute=True):
            invalid = self._webhook("payment.captured", checkout["razorpay_order_id"], checkout["amount"], secret="wrong-secret")
        self.assertEqual(invalid.status_code, 400)
        self.assertFalse(Order.objects.exists())
        self.assertEqual(self._setup_messages(), [])
        with self.captureOnCommitCallbacks(execute=True):
            captured = self._webhook("payment.captured", checkout["razorpay_order_id"], checkout["amount"], payment_id="pay_1")
        self.assertEqual(captured.status_code, 200, captured.content)
        self.assertEqual(len(self._setup_messages()), 1)
        order = Order.objects.get()
        with self.captureOnCommitCallbacks(execute=True):
            verified = self._verify(checkout, payment_id="pay_1")
        self.assertEqual(verified.status_code, 200, verified.content)
        self.assertEqual(verified.data["data"]["order_id"], order.pk)
        self.assertEqual(len(self._setup_messages()), 1)

    def test_dummy_verification_uses_same_commit_safe_setup_without_duplicate_messages(self):
        checkout, _, order = self._buy(["other@example.com"], provider="dummy")
        self._pay(checkout)
        self.assertEqual(order.payment_method, Order.PaymentMethod.DUMMY)
        self.assertEqual(len(self._setup_messages()), 1)
        self.assertFalse(Profile.objects.filter(user=order.customer).exists())

    def test_expired_used_and_wrong_purpose_setup_tokens_are_rejected(self):
        _, _, order = self._buy()
        token = self._token()
        self.assertEqual(self._check(token, purpose="recipient").status_code, 400)
        self.assertEqual(self._complete(token, purpose="recipient").status_code, 400)
        self.assertEqual(self._check(token + "tampered").status_code, 400)
        self.assertEqual(self._check(token, purpose="RESET").status_code, 400)
        EmailOTP.objects.filter(user=order.customer, purpose=EmailOTP.Purpose.PURCHASER).update(expires_at=timezone.now() - timedelta(seconds=1))
        self.assertEqual(self._check(token).status_code, 400)
        self.assertEqual(self._complete(token).status_code, 400)
        self._request_setup(order.customer.email)
        fresh = self._token()
        self.assertEqual(self._complete(fresh).status_code, 200)
        self.assertEqual(self._complete(fresh).status_code, 400)
        self.assertEqual(self._check(fresh).status_code, 400)

    def test_weak_or_mismatched_password_does_not_consume_setup_token(self):
        self._buy()
        token = self._token()
        self.assertEqual(self._complete(token, password="weak").status_code, 400)
        self.assertEqual(self._complete(token, confirm_password="Other@123").status_code, 400)
        self.assertEqual(self._check(token).status_code, 200)
        self.assertEqual(self._complete(token).status_code, 200)

    def test_purchaser_setup_token_cannot_be_used_for_an_unrelated_recipient(self):
        _, _, order = self._buy()
        token = self._token()
        other = order.recipients.first().user
        old_hash = other.password
        completed = self._complete(token, email=other.email)
        self.assertEqual(completed.status_code, 200)
        self.assertEqual(completed.data["data"]["email"], order.customer.email)
        other.refresh_from_db()
        self.assertEqual(other.password, old_hash)
        self.assertTrue(other.must_change_password)

    def test_old_pending_purchaser_recovers_through_new_inbox_link_without_another_purchase(self):
        user = make_user(email="legacy.buyer@example.com", password=None, email_verified=False, must_change_password=True)
        order = Order.objects.create(customer=user, purchaser_email=user.email, amount="999", payment_method="RAZORPAY", payment_status="PAID")
        with self.captureOnCommitCallbacks(execute=True):
            response = self._request_setup(" LEGACY.BUYER@example.com ")
        self.assertEqual(response.status_code, 200, response.content)
        self.assertNotIn("token", str(response.data).lower())
        user.refresh_from_db()
        self.assertTrue(user.must_change_password)
        self.assertFalse(user.has_usable_password())
        self.assertEqual(self._complete(self._token()).status_code, 200)
        user.refresh_from_db()
        self.assertTrue(user.email_verified)
        self.assertEqual(User.objects.filter(email=user.email).count(), 1)
        self.assertEqual(user.orders.get().pk, order.pk)
        self.assertFalse(Profile.objects.filter(user=user).exists())

    def test_recovery_responses_are_generic_and_do_not_setup_active_or_recipient_accounts(self):
        _, _, order = self._buy()
        purchaser = order.customer
        old_token = self._token()
        sent_before = len(self._setup_messages())
        known = self._request_setup(purchaser.email)
        self.assertEqual(len(self._setup_messages()), sent_before + 1)
        self.assertEqual(self._check(old_token).status_code, 400)
        active = make_user(email="active@example.com", password=PASSWORD)
        no_orders = make_user(email="no.orders@example.com", password=None, must_change_password=True)
        unpaid = make_user(email="unpaid@example.com", password=None, must_change_password=True)
        Order.objects.create(customer=unpaid, amount="999", payment_method="COD", payment_status="PENDING")
        for email in ["unknown@example.com", active.email, order.recipients.first().user.email, no_orders.email, unpaid.email]:
            response = self._request_setup(email)
            self.assertEqual(response.status_code, 200, response.content)
            self.assertEqual(response.data, known.data)
        self.assertEqual(len(self._setup_messages()), sent_before + 1)
        active.refresh_from_db()
        self.assertTrue(active.check_password(PASSWORD))

    def test_recovery_is_rate_limited_and_does_not_return_login_credentials(self):
        user = make_user(email="pending.buyer@example.com", password=None, must_change_password=True)
        Order.objects.create(customer=user, amount="999", payment_method="RAZORPAY", payment_status="PAID")
        responses = [self._request_setup(user.email) for _ in range(6)]
        self.assertEqual([response.status_code for response in responses[:5]], [200] * 5)
        self.assertEqual(responses[5].status_code, 429)
        for response in responses[:5]:
            self.assertNotIn("access", str(response.data))
            self.assertNotIn("token", str(response.data))
        user.refresh_from_db()
        self.assertTrue(user.must_change_password)

    def test_unverified_or_mismatched_checkout_cannot_auto_issue_setup(self):
        _, _, order = self._buy()
        session = order.checkout_session
        EmailOTP.objects.filter(user=order.customer, purpose=EmailOTP.Purpose.PURCHASER).delete()
        mail.outbox.clear()
        session.email_verified = False
        with self.captureOnCommitCallbacks(execute=True):
            onboarding.start_purchaser_setup(order, session)
        self.assertEqual(self._setup_messages(), [])
        session.email_verified = True
        session.email = "another@example.com"
        with self.captureOnCommitCallbacks(execute=True):
            onboarding.start_purchaser_setup(order, session)
        self.assertEqual(self._setup_messages(), [])

    def test_setup_delivery_uses_existing_brevo_transport_without_exposing_passwords(self):
        checkout = self._start(["other@example.com"])
        with self.settings(BREVO_API_KEY="mock-brevo-key"), mock.patch("accounts.emails.send_brevo_email", return_value=True) as send:
            self._pay(checkout)
        setup = [call for call in send.call_args_list if call.args[1] == SETUP_SUBJECT]
        self.assertEqual(len(setup), 1)
        self.assertEqual(setup[0].args[0], "srinadh@example.com")
        user = User.objects.get(email="srinadh@example.com")
        self.assertNotIn(user.password, setup[0].args[2])
        self.assertNotIn(PASSWORD, setup[0].args[2])

    def test_email_identity_change_invalidates_old_link_without_relinking_history(self):
        _, _, order = self._buy()
        token = self._token()
        user = order.customer
        User.objects.filter(pk=user.pk).update(email="renamed@example.com")
        self.assertEqual(self._check(token).status_code, 400)
        self.assertEqual(self._complete(token).status_code, 400)
        self.assertTrue(User.objects.get(pk=user.pk).must_change_password)
        # A purchaser snapshot for another email is not proof of ownership of
        # the newly named account. An unauthenticated request cannot relink it.
        count = len(self._setup_messages())
        self.assertEqual(self._request_setup("renamed@example.com").status_code, 200)
        self.assertEqual(len(self._setup_messages()), count)

    def test_delivery_outage_does_not_fail_payment_repeat_automatic_mail_or_log_secrets(self):
        checkout = self._start(["other@example.com"])
        attempted_tokens = []
        original_send = onboarding.send_email

        def reject_delivery(email, subject, html, text, context):
            if subject != SETUP_SUBJECT:
                return original_send(email, subject, html, text, context)
            attempted_tokens.append(re.search(r"[?&]token=([\w.\-]+)", text).group(1))
            raise RuntimeError(text)

        with mock.patch("accounts.onboarding.send_email", side_effect=reject_delivery), self.assertLogs("accounts.onboarding", level="WARNING") as logs:
            paid, order = self._pay(checkout)
        self.assertEqual(paid.status_code, 200)
        self.assertEqual(order.payment_status, Order.PaymentStatus.PAID)
        self.assertEqual(len(attempted_tokens), 3)
        for token in attempted_tokens:
            self.assertNotIn(token, "\n".join(logs.output))
        self._pay(checkout)
        self.assertEqual(self._setup_messages(), [])
        self.assertEqual(self._request_setup(order.customer.email).status_code, 200)
        self.assertEqual(len(self._setup_messages()), 1)
        self.assertEqual(self._complete(self._token()).status_code, 200)

    def test_brevo_rejection_cannot_echo_a_setup_token_or_key_into_logs(self):
        _, _, order = self._buy(["other@example.com"])
        token = self._token()
        provider_payloads = [
            {"code": token, "message": f"Rejected link containing {token}"},
            [token],
            None,
        ]
        for payload in provider_payloads:
            with self.subTest(payload_type=type(payload).__name__):
                with self.settings(BREVO_API_KEY="mock-provider-secret"), mock.patch("accounts.onboarding.smtp_configured", return_value=False), mock.patch("accounts.emails.requests.post") as post, self.assertLogs("accounts.email", level="ERROR") as logs:
                    post.return_value.status_code = 400
                    post.return_value.json.return_value = payload
                    delivered = onboarding.deliver_purchaser_setup_email(order.customer_id, token)
                self.assertFalse(delivered)
                self.assertEqual(post.call_count, 3)
                output = "\n".join(logs.output)
                self.assertIn("status=400", output)
                self.assertNotIn(token, output)
                self.assertNotIn("mock-provider-secret", output)

    def test_invalid_setup_purpose_and_malformed_recovery_email_return_validation_errors(self):
        self._buy()
        token = self._token()
        for purpose in [[], {}, None, "unknown", True]:
            with self.subTest(purpose=purpose):
                response = self._check(token, purpose=purpose)
                self.assertEqual(response.status_code, 400, response.content)
                self.assertEqual(self._complete(token, purpose=purpose).status_code, 400)
        for email in [[], {}, None, "", "not-an-email", True]:
            with self.subTest(email=email):
                self.assertEqual(self._request_setup(email).status_code, 400)
        self.assertEqual(len(self._setup_messages()), 1)

    def test_reset_initial_and_resend_do_not_issue_codes_for_pending_purchaser_or_recipient(self):
        _, _, order = self._buy()
        with mock.patch("accounts.views.send_password_reset_otp_email") as send:
            for user in [order.customer, order.recipients.first().user]:
                for url, extra in [("auth-forgot-password", {}), ("auth-resend-otp", {"purpose": "RESET"})]:
                    response = self.client.post(reverse(url), {"email": user.email, **extra}, format="json")
                    self.assertEqual(response.status_code, 200, response.content)
                self.assertFalse(EmailOTP.objects.filter(user=user, purpose=EmailOTP.Purpose.RESET).exists())
        send.assert_not_called()

    def test_reset_verification_and_completion_reject_legacy_tokens_for_pending_users(self):
        _, _, order = self._buy()
        for user in [order.customer, order.recipients.first().user]:
            with self.subTest(user=user.email):
                otp, code = EmailOTP.issue(user, EmailOTP.Purpose.RESET)
                response = self.client.post(reverse("auth-verify-reset-otp"), {"email": user.email, "otp": code}, format="json")
                self.assertEqual(response.status_code, 400, response.content)
                token = otp.issue_reset_token()
                response = self.client.post(
                    reverse("auth-reset-password"),
                    {"reset_token": token, "new_password": PASSWORD, "confirm_password": PASSWORD}, format="json",
                )
                self.assertEqual(response.status_code, 400, response.content)
                user.refresh_from_db()
                self.assertTrue(user.must_change_password)
                self.assertFalse(user.has_usable_password())

    def test_reset_tokens_and_purchaser_tokens_cannot_be_swapped_between_purposes(self):
        _, _, order = self._buy()
        user = make_user(email="active@example.com", password=PASSWORD)
        otp, _ = EmailOTP.issue(user, EmailOTP.Purpose.RESET)
        reset_token = otp.issue_reset_token()
        self.assertEqual(self._check(reset_token).status_code, 400)
        self.assertEqual(self._complete(reset_token).status_code, 400)
        self.assertEqual(self.client.post(
            reverse("auth-reset-password"),
            {"reset_token": self._token(), "new_password": PASSWORD, "confirm_password": PASSWORD}, format="json",
        ).status_code, 400)
        order.customer.refresh_from_db()
        self.assertTrue(order.customer.must_change_password)

    def test_legitimate_activated_password_reset_still_works(self):
        user = make_user(email="active@example.com", password=PASSWORD)
        with mock.patch("accounts.views._send_in_background", side_effect=lambda fn, *args: fn(*args)), mock.patch("accounts.views.send_password_reset_otp_email", return_value=True) as send:
            initial = self.client.post(reverse("auth-forgot-password"), {"email": user.email}, format="json")
            resent = self.client.post(reverse("auth-resend-otp"), {"email": user.email, "purpose": "RESET"}, format="json")
        self.assertEqual((initial.status_code, resent.status_code), (200, 200))
        self.assertEqual(send.call_count, 2)
        code = send.call_args.args[1]
        verified = self.client.post(reverse("auth-verify-reset-otp"), {"email": user.email, "otp": code}, format="json")
        self.assertEqual(verified.status_code, 200, verified.content)
        complete = self.client.post(
            reverse("auth-reset-password"),
            {"reset_token": verified.data["data"]["reset_token"], "new_password": "NewPass@456", "confirm_password": "NewPass@456"}, format="json",
        )
        self.assertEqual(complete.status_code, 200, complete.content)
        user.refresh_from_db()
        self.assertTrue(user.check_password("NewPass@456"))

