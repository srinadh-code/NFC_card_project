"""NFC inventory authorization and duplicate-allocation regressions."""
from django.test import override_settings
from django.urls import reverse
from rest_framework.test import APITestCase

from admin_api import test_recipient_assignment as fixtures
from nfc_cards.models import NfcCard


@override_settings(**fixtures.RecipientAssignmentSecurityTests._overridden_settings)
class CardAssignmentSecurityTests(APITestCase):
    setUp = fixtures.RecipientAssignmentSecurityTests.setUp
    make_order = fixtures.RecipientAssignmentSecurityTests.make_order
    assign = fixtures.RecipientAssignmentSecurityTests.assign

    def test_one_inventory_card_cannot_fulfill_two_recipient_slots(self):
        order, slot = self.make_order()
        self.assertEqual(self.assign(order, slot).status_code, 200)
        another_order, another_slot = self.make_order()
        response = self.assign(another_order, another_slot)
        self.assertEqual(response.status_code, 400, response.content)
        slot.refresh_from_db()
        another_slot.refresh_from_db()
        self.card.refresh_from_db()
        self.assertEqual(slot.assigned_card_id, self.card.pk)
        self.assertIsNone(another_slot.assigned_card_id)
        self.assertEqual(self.card.user_id, self.recipient.pk)

    def test_customer_cannot_write_inventory_through_canonical_or_legacy_admin_urls(self):
        self.client.force_authenticate(self.other)
        payload = {"role": "ADMIN", "is_staff": True, "customer_email": self.other.email, "email": self.other.email, "status": "ACTIVE"}
        for prefix in ("admin-card", "nfc-cards-admin"):
            with self.subTest(prefix=prefix):
                detail_name = "admin-card-detail" if prefix == "admin-card" else "nfc-cards-admin-detail"
                detail = reverse(detail_name, args=[self.card.pk])
                for method in ("put", "patch", "delete"):
                    with self.subTest(method=method):
                        self.assertEqual(getattr(self.client, method)(detail, payload, format="json").status_code, 403)
                for action in ("assign", "activate", "block", "mark-lost"):
                    name = f"{prefix}-{action}"
                    self.assertEqual(self.client.post(reverse(name, args=[self.card.pk]), payload, format="json").status_code, 403)
        self.card.refresh_from_db()
        self.assertEqual((self.card.user_id, self.card.status), (None, NfcCard.Status.UNASSIGNED))

    def test_buyer_cannot_activate_card_allocated_to_a_different_recipient(self):
        order, slot = self.make_order()
        self.assertEqual(self.assign(order, slot).status_code, 200)
        self.client.force_authenticate(self.buyer)
        # Paid purchaser-only accounts cannot use recipient features at all.
        for name, args, data in (
            ("nfc-cards-activate", [], {"uid": self.card.uid}),
            ("nfc-cards-activate-assigned", [self.card.pk], {}),
        ):
            response = self.client.post(reverse(name, args=args), data, format="json")
            self.assertEqual(response.status_code, 403, response.content)
        self.card.refresh_from_db()
        self.assertEqual((self.card.user_id, self.card.status), (self.recipient.pk, "ASSIGNED"))
