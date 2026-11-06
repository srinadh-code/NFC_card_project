from django.test import override_settings
from django.urls import reverse
from django.utils import timezone
from rest_framework.test import APITestCase

from accounts.models import User
from common.test_utils import make_user
from nfc_cards.models import NfcCard
from orders.models import Order, OrderItem, OrderRecipient, Transaction
from profiles.models import Profile


@override_settings(PASSWORD_HASHERS=["django.contrib.auth.hashers.MD5PasswordHasher"], EMAIL_BACKEND="django.core.mail.backends.locmem.EmailBackend", BREVO_API_KEY="")
class RecipientAssignmentSecurityTests(APITestCase):
    def setUp(self):
        self.admin = make_user(email="admin@example.com", role=User.Role.ADMIN, is_staff=True)
        self.buyer = make_user(email="buyer@example.com")
        self.recipient = make_user(email="recipient@example.com")
        self.other = make_user(email="other@example.com")
        self.profile = Profile.ensure_for_user(self.recipient)
        self.client.force_authenticate(self.admin)
        self.card = NfcCard.objects.create(uid="REAL-CARD-UID", serial_number="REAL-CARD-001")

    def make_order(self, paid=True, ledger=True):
        order = Order.objects.create(
            customer=self.buyer, amount="999.00", payment_method="RAZORPAY",
            payment_status="PAID" if paid else "PENDING",
            shipping_line1="Delivery address", shipping_city="Hyderabad",
            shipping_state="Telangana", shipping_pincode="500001",
        )
        OrderItem.objects.create(order=order, product_id="PRD-NEXORA-CUSTOM", name="Custom card", card_type="CUSTOM", color="Black", qty=1, price="999.00")
        slot = OrderRecipient.objects.create(order=order, name="Recipient", email=self.recipient.email, phone="9000000002", user=self.recipient, profile=self.profile)
        if ledger:
            Transaction.objects.create(order=order, amount="999.00", method="RAZORPAY", status="PAID" if paid else "PENDING")
        return order, slot

    def assign(self, order, slot=None):
        payload = {"card_id": self.card.pk}
        if slot is not None:
            payload["recipient_id"] = slot.pk
        return self.client.post(reverse("admin-order-assign-card", args=[order.pk]), payload, format="json")

    def test_assignment_requires_paid_order_and_successful_payment_ledger(self):
        for paid, ledger in ((False, True), (True, False)):
            with self.subTest(paid=paid, ledger=ledger):
                order, slot = self.make_order(paid=paid, ledger=ledger)
                response = self.assign(order, slot)
                self.assertEqual(response.status_code, 400, response.content)
                self.card.refresh_from_db()
                slot.refresh_from_db()
                self.assertEqual(self.card.status, "UNASSIGNED")
                self.assertIsNone(self.card.user_id)
                self.assertIsNone(slot.assigned_card_id)

    def test_recipient_slot_must_belong_to_the_requested_parent_order(self):
        order, slot = self.make_order()
        other_order, other_slot = self.make_order()
        response = self.assign(order, other_slot)
        self.assertEqual(response.status_code, 400, response.content)
        self.card.refresh_from_db()
        slot.refresh_from_db()
        other_slot.refresh_from_db()
        self.assertIsNone(self.card.user_id)
        self.assertIsNone(slot.assigned_card_id)
        self.assertIsNone(other_slot.assigned_card_id)

    def test_repeating_assignment_keeps_active_state_and_activation_timestamp(self):
        order, slot = self.make_order()
        self.assertEqual(self.assign(order, slot).status_code, 200)
        self.card.refresh_from_db()
        activated = timezone.now()
        self.card.status = "ACTIVE"
        self.card.activated_on = activated
        self.card.save(update_fields=["status", "activated_on", "updated_at"])
        response = self.assign(order, slot)
        self.assertEqual(response.status_code, 200, response.content)
        self.card.refresh_from_db()
        self.assertEqual(self.card.status, "ACTIVE")
        self.assertEqual(self.card.activated_on, activated)
        self.assertEqual(self.card.user_id, self.recipient.pk)
        self.assertEqual(OrderRecipient.objects.filter(assigned_card=self.card).count(), 1)

    def test_generic_card_assignment_cannot_steal_an_order_recipient_card(self):
        order, slot = self.make_order()
        self.assertEqual(self.assign(order, slot).status_code, 200)
        response = self.client.post(reverse("admin-card-assign", args=[self.card.pk]), {"email": self.other.email}, format="json")
        self.assertEqual(response.status_code, 400, response.content)
        patch = self.client.patch(reverse("admin-card-detail", args=[self.card.pk]), {"customer_email": self.other.email}, format="json")
        self.assertEqual(patch.status_code, 400, patch.content)
        release = self.client.patch(reverse("admin-card-detail", args=[self.card.pk]), {"status": "UNASSIGNED", "customer_email": ""}, format="json")
        self.assertEqual(release.status_code, 400, release.content)
        self.card.refresh_from_db()
        slot.refresh_from_db()
        self.assertEqual(self.card.user_id, self.recipient.pk)
        self.assertEqual(slot.assigned_card_id, self.card.pk)

    def test_another_customer_cannot_activate_an_assigned_recipient_card(self):
        order, slot = self.make_order()
        self.assertEqual(self.assign(order, slot).status_code, 200)
        self.client.force_authenticate(self.other)
        response = self.client.post(reverse("nfc-cards-activate"), {"uid": self.card.uid}, format="json")
        self.assertEqual(response.status_code, 400, response.content)
        self.card.refresh_from_db()
        self.assertEqual((self.card.user_id, self.card.status), (self.recipient.pk, "ASSIGNED"))
