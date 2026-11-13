"""Offline payment boundary checks and explicit approval-pending findings."""
from datetime import timedelta
from unittest import expectedFailure

from django.test import override_settings, tag
from django.urls import reverse
from django.utils import timezone
from rest_framework.test import APITestCase

from orders.models import Order, RecipientEmailAllocation, Transaction
from payments import tests as fixtures
from payments.models import CheckoutSession
from payments.services import is_recipient_email_available


@override_settings(**fixtures.RazorpayOnboardingTests._overridden_settings)
class PaymentSecurityTests(APITestCase):
    setUp = fixtures.RazorpayOnboardingTests.setUp
    _fake_create_order = fixtures.RazorpayOnboardingTests._fake_create_order
    _email_token = fixtures.RazorpayOnboardingTests._email_token
    _with_token = fixtures.RazorpayOnboardingTests._with_token
    _checkout = fixtures.RazorpayOnboardingTests._checkout
    _verify = fixtures.RazorpayOnboardingTests._verify
    _webhook = fixtures.RazorpayOnboardingTests._webhook

    def test_signature_for_one_checkout_cannot_confirm_a_different_checkout(self):
        first = self._checkout()
        payload = fixtures._guest_payload(email="second.buyer@example.com")
        second = self._checkout(payload)
        response = self._verify(second, signature=fixtures._sign(first["razorpay_order_id"], "pay_test1"))
        self.assertEqual(response.status_code, 400)
        self.assertFalse(Order.objects.exists())
        self.assertFalse(Transaction.objects.exists())
        self.assertEqual(CheckoutSession.objects.filter(status="CREATED").count(), 2)

    def test_forged_verify_webhook_and_amount_mismatch_never_create_order(self):
        checkout = self._checkout()
        self.assertEqual(self._verify(checkout, signature="0" * 64).status_code, 400)
        self.assertEqual(self._webhook("payment.captured", checkout["razorpay_order_id"], checkout["amount"], secret="invalid-test-signing-key").status_code, 400)
        self.assertEqual(self._webhook("payment.captured", checkout["razorpay_order_id"], checkout["amount"] - 1).status_code, 200)
        self.assertFalse(Order.objects.exists())
        self.assertFalse(Transaction.objects.exists())

    def test_replayed_valid_callbacks_keep_one_order_and_ledger_entry(self):
        checkout = self._checkout()
        first = self._verify(checkout)
        self.assertEqual(first.status_code, 200, first.content)
        replay = self._verify(checkout)
        webhook = self._webhook("payment.captured", checkout["razorpay_order_id"], checkout["amount"])
        self.assertEqual(replay.status_code, 200)
        self.assertEqual(webhook.status_code, 200)
        self.assertEqual(replay.data["data"]["order_id"], first.data["data"]["order_id"])
        self.assertEqual(Order.objects.count(), 1)
        self.assertEqual(Transaction.objects.count(), 1)

    @override_settings(DUMMY_PAYMENTS_ENABLED=False)
    def test_disabled_dummy_provider_rejects_creation_and_confirmation(self):
        response = self.client.post(reverse("razorpay-checkout"), {**fixtures._guest_payload(), "provider": "dummy"}, format="json")
        self.assertEqual(response.status_code, 403)
        response = self.client.post(reverse("dummy-payment-confirm"), {"checkout_id": "bad", "amount": 1}, format="json")
        self.assertEqual(response.status_code, 403)
        self.assertFalse(Order.objects.exists())

    @tag("pending_security_approval")
    @expectedFailure
    def test_abandoned_checkout_does_not_reserve_another_persons_email_forever(self):
        """Open finding: CREATED sessions have no reservation expiry."""
        payload = fixtures._guest_payload()
        payload["recipients"][0]["email"] = "unrelated.recipient@example.com"
        checkout = self._checkout(payload)
        CheckoutSession.objects.filter(public_id=checkout["checkout_id"]).update(created_at=timezone.now() - timedelta(days=30))
        self.assertTrue(RecipientEmailAllocation.objects.filter(normalized_email="unrelated.recipient@example.com").exists())
        self.assertTrue(is_recipient_email_available("unrelated.recipient@example.com", "different.buyer@example.com"))
