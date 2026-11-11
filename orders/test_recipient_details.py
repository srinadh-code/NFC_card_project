from decimal import Decimal

from django.test import override_settings
from django.urls import reverse
from rest_framework.test import APITestCase

from common.test_utils import make_user
from nfc_cards.models import NfcCard

from .models import Order, OrderItem, OrderRecipient


@override_settings(PASSWORD_HASHERS=["django.contrib.auth.hashers.MD5PasswordHasher"])
class PurchaserOrderRecipientDetailsTests(APITestCase):
    def setUp(self):
        self.buyer = make_user("srinadh@example.com", full_name="Srinadh", phone="9000000001")
        self.other = make_user("unrelated@example.com")
        self.client.force_authenticate(self.buyer)

    def order(self, names, *, buyer=None, **overrides):
        buyer = buyer or self.buyer
        fields = {
            "customer": buyer,
            "purchaser_name": buyer.full_name,
            "purchaser_email": buyer.email,
            "purchaser_phone": buyer.phone,
            "amount": Decimal("150.00"),
            "shipping": Decimal("10.00"),
            "payment_method": Order.PaymentMethod.RAZORPAY,
            "payment_status": Order.PaymentStatus.PAID,
            "status": Order.Status.PROCESSING,
            "shipping_line1": "123 Main St",
            "shipping_city": "Hyderabad",
            "shipping_state": "Telangana",
            "shipping_pincode": "500001",
        }
        fields.update(overrides)
        order = Order.objects.create(**fields)
        OrderItem.objects.create(
            order=order, product_id="custom", name="Custom card", card_type="CUSTOM",
            color="Black", qty=len(names) or 1, price="50.00",
        )
        for name in names:
            OrderRecipient.objects.create(
                order=order, name=name, email=f"{name.lower()}@example.com", phone="9000000002",
                user=self.buyer if name == "Srinadh" else None,
            )
        return order

    def details(self, order):
        response = self.client.get(reverse("my-order-detail", args=[order.pk]))
        self.assertEqual(response.status_code, 200, response.data)
        return response.data["data"]

    def test_two_orders_keep_three_and_two_recipients_with_original_totals(self):
        first = self.order(["Kavya", "Lakshmi", "Srinadh"], order_number="NXTRK382130")
        second = self.order(["Deepika", "Priya"], order_number="NXTRK941666", amount="100.00")
        # Even matching purchaser contact snapshots do not grant ownership.
        unrelated = self.order(["Foreign"], buyer=self.other, purchaser_email=self.buyer.email)

        response = self.client.get(reverse("my-orders"))
        self.assertEqual(response.status_code, 200, response.data)
        self.assertEqual(response.data["pagination"]["count"], 2)
        rows = {row["id"]: row for row in response.data["data"]}
        self.assertEqual(set(rows), {first.pk, second.pk})
        self.assertNotIn(unrelated.pk, rows)
        self.assertEqual(sum(item["qty"] for row in rows.values() for item in row["items"]), 5)
        self.assertEqual(sum(Decimal(row["total"]) for row in rows.values()), Decimal("270.00"))
        for order, names in ((first, ["Kavya", "Lakshmi", "Srinadh"]), (second, ["Deepika", "Priya"])):
            with self.subTest(order=order.order_number):
                detail = self.details(order)
                expected_ids = list(order.recipients.values_list("id", flat=True))
                self.assertEqual([row["id"] for row in detail["recipients"]], expected_ids)
                self.assertEqual([row["name"] for row in detail["recipients"]], names)
                self.assertEqual(rows[order.pk]["recipients"], detail["recipients"])
                self.assertEqual(detail["order_number"], order.order_number)
                self.assertEqual(detail["status"], Order.Status.PROCESSING)
                self.assertEqual(detail["payment_status"], Order.PaymentStatus.PAID)

    def test_purchaser_buying_only_for_self_remains_a_recipient(self):
        order = self.order(["Srinadh"])
        recipient = self.details(order)["recipients"]
        self.assertEqual(len(recipient), 1)
        self.assertEqual(recipient[0]["user_id"], self.buyer.pk)
        self.assertEqual((recipient[0]["name"], recipient[0]["email"]), ("Srinadh", self.buyer.email))

    def test_purchaser_buying_only_for_others_sees_saved_recipient_contacts(self):
        order = self.order(["Kavya", "Lakshmi", "Deepika"])
        detail = self.details(order)
        self.assertEqual(
            [(row["name"], row["email"], row["phone"]) for row in detail["recipients"]],
            [(name, f"{name.lower()}@example.com", "9000000002") for name in ["Kavya", "Lakshmi", "Deepika"]],
        )
        self.assertNotIn(self.buyer.email, [row["email"] for row in detail["recipients"]])

    def test_repeated_names_emails_and_users_do_not_mix_order_recipient_rows(self):
        first = self.order(["Srinadh", "Kavya", "Lakshmi"])
        second = self.order(["Srinadh", "Kavya"])
        for recipient in second.recipients.all():
            recipient.phone = "9000000003"
            recipient.save(update_fields=["phone"])
        first_rows = self.details(first)["recipients"]
        second_rows = self.details(second)["recipients"]
        self.assertTrue({row["id"] for row in first_rows}.isdisjoint(row["id"] for row in second_rows))
        self.assertEqual([row["phone"] for row in first_rows], ["9000000002"] * 3)
        self.assertEqual([row["phone"] for row in second_rows], ["9000000003"] * 2)

    def test_card_assignment_and_activation_are_reported_per_recipient(self):
        order = self.order(["Srinadh", "Kavya", "Lakshmi"])
        recipients = list(order.recipients.all())
        for recipient, state in zip(recipients, [NfcCard.Status.ACTIVE, NfcCard.Status.ASSIGNED]):
            card = NfcCard.objects.create(uid=f"recipient-{recipient.pk}", serial_number=f"SN{recipient.pk}", status=state)
            recipient.assigned_card = card
            recipient.save(update_fields=["assigned_card"])
        rows = self.details(order)["recipients"]
        self.assertEqual([row["activation_status"] for row in rows], ["ACTIVE", "PENDING", "UNASSIGNED"])
        self.assertEqual([row["assigned_card_status"] for row in rows], ["ACTIVE", "ASSIGNED", None])
        self.assertEqual(rows[0]["assigned_card_serial"], recipients[0].assigned_card.serial_number)
        self.assertIsNone(rows[2]["assigned_card_id"])

    def test_order_snapshots_survive_account_edits(self):
        order = self.order(["Srinadh"], purchaser_name="Srinadh at checkout", purchaser_phone="9000000004")
        self.buyer.full_name = "Updated account"
        self.buyer.email = "updated@example.com"
        self.buyer.phone = "9000000005"
        self.buyer.save(update_fields=["full_name", "email", "phone"])
        detail = self.details(order)
        self.assertEqual(
            (detail["customer_name"], detail["customer_email"], detail["customer_phone"]),
            ("Srinadh at checkout", "srinadh@example.com", "9000000004"),
        )
        self.assertEqual(detail["recipients"][0]["email"], "srinadh@example.com")
        self.assertEqual(detail["placed_at"], order.placed_at.isoformat().replace("+00:00", "Z"))
        self.assertEqual(Decimal(detail["total"]), order.total)

    def test_missing_historical_recipients_are_an_empty_list(self):
        self.assertEqual(self.details(self.order([]))["recipients"], [])

    def test_another_user_cannot_read_order_even_if_they_are_a_recipient(self):
        order = self.order(["Srinadh", "Kavya"])
        order.recipients.filter(name="Kavya").update(user=self.other, email=self.other.email)
        self.client.force_authenticate(self.other)
        response = self.client.get(reverse("my-order-detail", args=[order.pk]))
        self.assertEqual(response.status_code, 404)
        self.assertNotIn("recipients", response.data)
        self.assertEqual(self.client.get(reverse("my-orders")).data["data"], [])

    def test_order_detail_requires_authentication(self):
        order = self.order(["Kavya"])
        self.client.force_authenticate(None)
        response = self.client.get(reverse("my-order-detail", args=[order.pk]))
        self.assertIn(response.status_code, (401, 403))

    def test_public_tracking_does_not_expose_recipient_contacts(self):
        order = self.order(["Kavya"])
        self.client.force_authenticate(None)
        responses = [
            self.client.get(reverse("public-track-order", args=[order.order_number])),
            self.client.get(reverse("public-order-tracking"), {"order": order.pk, "token": str(order.tracking_token)}),
        ]
        for response in responses:
            with self.subTest(response=response.data):
                self.assertEqual(response.status_code, 200, response.data)
                self.assertNotIn("recipients", response.data["data"])
                self.assertNotIn("kavya@example.com", str(response.data))
