from django.urls import reverse
from django.test import override_settings
from rest_framework.test import APITestCase

from accounts.models import User
from accounts.roles import roles_for
from orders.models import RecipientEmailAllocation, RecipientEmailReservation
from payments.models import CheckoutSession
from payments import test_multi_recipient as fixtures


@override_settings(**fixtures.MultiRecipientPaymentTests._overridden_settings)
class StaleRecipientAllocationTests(APITestCase):
    """Exercise stale claims through the real checkout and payment endpoints."""

    setUp = fixtures.MultiRecipientPaymentTests.setUp
    _fake_create_order = fixtures.MultiRecipientPaymentTests._fake_create_order
    _email_token = fixtures.MultiRecipientPaymentTests._email_token
    _with_token = fixtures.MultiRecipientPaymentTests._with_token
    _checkout = fixtures.MultiRecipientPaymentTests._checkout
    _verify = fixtures.MultiRecipientPaymentTests._verify
    buy = fixtures.MultiRecipientPaymentTests.buy

    def test_purchaser_self_checkout_reuses_stale_allocation_and_password(self):
        email = "self.buyer@example.com"
        self.buy([fixtures.recipient(email="other.person@example.com")], email=email)
        buyer = User.objects.get(email=email)
        buyer.set_password("Existing-password-123")
        buyer.save(update_fields=["password"])
        password = buyer.password
        allocation = RecipientEmailAllocation.objects.create(normalized_email=email, owner_email=email)

        response = self.client.post(reverse("recipient-email-availability"), {
            "email": email.upper(), "buyer_email": email,
        }, format="json")
        self.assertTrue(response.data["data"]["available"])
        _, order = self.buy([fixtures.recipient(email=email)], email=email)
        buyer.refresh_from_db()
        slot = order.recipients.get()
        self.assertEqual((order.customer_id, slot.user_id), (buyer.pk, buyer.pk))
        self.assertEqual(slot.email_allocation_id, allocation.pk)
        self.assertEqual(buyer.password, password)
        self.assertEqual(roles_for(buyer), ["PURCHASER", "RECIPIENT"])
        self.assertEqual(User.objects.filter(email__iexact=email).count(), 1)
        self.assertEqual(RecipientEmailAllocation.objects.filter(normalized_email=email).count(), 1)

    def test_terminal_or_orphan_fulfilled_session_does_not_hold_email(self):
        for status in (CheckoutSession.Status.FAILED, CheckoutSession.Status.FULFILLED):
            with self.subTest(status=status):
                email = f"{status.lower()}@example.com"
                checkout = self._checkout({
                    **fixtures._guest_payload(email="buyer@example.com"),
                    "recipients": [fixtures.recipient(email=email)],
                })
                session = CheckoutSession.objects.get(public_id=checkout["checkout_id"])
                allocation = RecipientEmailAllocation.objects.get(normalized_email=email)
                session.status = status
                session.save(update_fields=["status"])
                # Leave the old reservation behind, as historical inconsistencies can.
                _, order = self.buy([fixtures.recipient(email=email)], email="new.buyer@example.com")
                self.assertEqual(order.recipients.get().email_allocation_id, allocation.pk)
                self.assertEqual(RecipientEmailAllocation.objects.filter(normalized_email=email).count(), 1)
                session.refresh_from_db()
                self.assertEqual(session.status, status)
                self.assertIsNone(session.order_id)

    def test_cancelled_abandoned_checkout_can_be_retried(self):
        email = "abandoned@example.com"
        unrelated = RecipientEmailAllocation.objects.create(
            normalized_email="unrelated@example.com", owner_email="original@example.com",
        )
        checkout = self._checkout({
            **fixtures._guest_payload(), "recipients": [fixtures.recipient(email=email)],
        })
        cancelled = self.client.post(reverse("checkout-cancel"), {
            "checkout_id": checkout["checkout_id"],
        }, format="json")
        self.assertEqual(cancelled.status_code, 200)
        self.assertTrue(RecipientEmailAllocation.objects.filter(pk=unrelated.pk).exists())
        self.buy([fixtures.recipient(email=email)])
        self.assertEqual(User.objects.filter(email=email).count(), 1)
        self.assertEqual(RecipientEmailAllocation.objects.filter(normalized_email=email).count(), 1)
        self.assertFalse(RecipientEmailReservation.objects.filter(allocation__normalized_email=email).exists())

    def test_existing_active_card_blocks_even_an_empty_allocation_for_its_owner(self):
        from nfc_cards.models import NfcCard

        email = "active.owner@example.com"
        user = fixtures.make_user(email=email)
        NfcCard.objects.create(uid="active-owner", serial_number="ACTIVE-OWNER", user=user, status="ACTIVE")
        allocation = RecipientEmailAllocation.objects.create(normalized_email=email, owner_email=email)
        response = self.client.post(reverse("recipient-email-availability"), {
            "email": email, "buyer_email": email,
        }, format="json")
        self.assertFalse(response.data["data"]["available"])
        self.assertTrue(RecipientEmailAllocation.objects.filter(pk=allocation.pk).exists())
