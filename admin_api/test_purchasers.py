from decimal import Decimal

from django.test import override_settings
from django.urls import reverse
from rest_framework.test import APITestCase

from accounts.models import User
from common.test_utils import make_user
from nfc_cards.models import NfcCard
from orders.models import Order, OrderItem, OrderRecipient
from profiles.models import Profile


@override_settings(PASSWORD_HASHERS=["django.contrib.auth.hashers.MD5PasswordHasher"])
class AdminPurchaserTests(APITestCase):
    def setUp(self):
        self.admin = make_user("purchaser-admin@example.com", role=User.Role.ADMIN, is_staff=True)
        self.buyer = make_user("rahul@example.com", full_name="Rahul", phone="+919000000001")
        self.client.force_authenticate(self.admin)

    def order(self, quantity, buyer=None, payment_status=Order.PaymentStatus.PAID, amount="100.00", name=None, email=None, phone=None):
        buyer = buyer or self.buyer
        order = Order.objects.create(customer=buyer, amount=Decimal(amount), shipping=Decimal("10.00"), payment_status=payment_status,
            purchaser_name=buyer.full_name if name is None else name, purchaser_email=buyer.email if email is None else email,
            purchaser_phone=buyer.phone if phone is None else phone,
            payment_method=Order.PaymentMethod.RAZORPAY, shipping_line1="123 Main St", shipping_city="Hyderabad",
            shipping_state="Telangana", shipping_pincode="500001")
        OrderItem.objects.create(order=order, product_id="custom", name="Custom card", card_type="CUSTOM", color="Black", qty=quantity, price="50.00")
        return order

    def recipient(self, order, user, name=None, card=None):
        return OrderRecipient.objects.create(order=order, user=user, profile=Profile.ensure_for_user(user),
            name=name or user.full_name, email=user.email, phone="+447700900123", assigned_card=card)

    def test_same_email_different_names_keep_independent_order_rows(self):
        first = self.order(1, name="Kavya", phone="9000000001", amount="100.00")
        second = self.order(1, name="Manideep", phone="9000000002", amount="200.00")
        response = self.client.get(reverse("admin-purchasers"))
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["pagination"]["count"], 2)
        rows = {row["id"]: row for row in response.data["data"]}
        for order in (first, second):
            row = rows[order.pk]
            self.assertEqual((row["name"], row["email"], row["phone"]),
                             (order.purchaser_name, self.buyer.email, order.purchaser_phone))
            self.assertEqual(row["order_number"], order.order_number)
            self.assertEqual(row["customer_id"], self.buyer.pk)
            self.assertEqual(row["total_cards_purchased"], 1)
            self.assertEqual(Decimal(row["total_amount_paid"]), order.total)
        self.buyer.refresh_from_db()
        self.assertEqual(self.buyer.full_name, "Rahul")

    def test_identical_purchaser_contacts_still_produce_three_rows(self):
        orders = [self.order(quantity, name="Srinadh") for quantity in (3, 1, 3)]
        response = self.client.get(reverse("admin-purchasers"))
        self.assertEqual(response.data["pagination"]["count"], 3)
        rows = response.data["data"]
        self.assertEqual([row["id"] for row in rows], [order.pk for order in reversed(orders)])
        self.assertEqual([row["total_cards_purchased"] for row in rows], [3, 1, 3])
        self.assertEqual([row["name"] for row in rows], ["Srinadh"] * 3)

    def test_name_change_on_third_purchase_keeps_all_original_names_and_quantities(self):
        for name, quantity in (("Srinadh", 3), ("Srinadh", 1), ("Vinay", 2)):
            self.order(quantity, name=name)
        rows = self.client.get(reverse("admin-purchasers")).data["data"]
        self.assertEqual([(row["name"], row["total_cards_purchased"]) for row in reversed(rows)],
                         [("Srinadh", 3), ("Srinadh", 1), ("Vinay", 2)])

    def test_purchase_for_others_then_self_keeps_order_recipients_separate(self):
        first = self.order(3, name="Srinadh")
        others = [make_user(f"{name.lower()}@example.com", full_name=name) for name in ("Kavya", "Laksmi", "Deepika")]
        for user in others:
            self.recipient(first, user)
        customers = self.client.get(reverse("admin-customers")).data["data"]
        self.assertNotIn(self.buyer.pk, [row["id"] for row in customers])
        second = self.order(1, name="Srinadh")
        self.recipient(second, self.buyer, name="Srinadh")
        customers = self.client.get(reverse("admin-customers")).data["data"]
        self.assertIn(self.buyer.pk, [row["id"] for row in customers])
        for order, expected in ((first, {user.email for user in others}), (second, {self.buyer.email})):
            response = self.client.get(reverse("admin-purchaser-detail", args=[order.pk]))
            self.assertEqual(response.status_code, 200, response.data)
            self.assertEqual(response.data["data"]["id"], order.pk)
            self.assertEqual({row["email"] for row in response.data["data"]["order"]["recipients"]}, expected)
        self.assertEqual(self.client.get(reverse("admin-purchasers")).data["pagination"]["count"], 2)
        self.assertEqual(User.objects.filter(email=self.buyer.email).count(), 1)

    def test_account_and_profile_edits_never_change_historical_purchase_contacts(self):
        order = self.order(1, name="Kavya", email="original@example.com", phone="9000000001")
        profile = Profile.ensure_for_user(self.buyer)
        self.buyer.full_name, self.buyer.email, self.buyer.phone = "New Name", "new@example.com", "9000000002"
        self.buyer.save(update_fields=["full_name", "email", "phone"])
        profile.company = "New Company"
        profile.save(update_fields=["company"])
        response = self.client.get(reverse("admin-purchaser-detail", args=[order.pk]))
        row = response.data["data"]
        self.assertEqual((row["name"], row["email"], row["phone"]), ("Kavya", "original@example.com", "9000000001"))
        self.assertEqual(row["order"]["customer_name"], "Kavya")
        order.refresh_from_db()
        self.assertEqual(order.purchaser_name, "Kavya")

    def test_missing_historical_contacts_are_not_invented_from_current_account(self):
        order = self.order(1, name="", email="", phone="")
        response = self.client.get(reverse("admin-purchaser-detail", args=[order.pk]))
        self.assertEqual(response.status_code, 200, response.data)
        row = response.data["data"]
        self.assertEqual((row["name"], row["email"], row["phone"]), ("", "", ""))
        self.assertEqual(row["order"]["customer_name"], "")

    def test_paid_orders_use_their_own_quantities_and_totals_without_join_multiplication(self):
        priya = make_user("priya@example.com", full_name="Priya")
        kiran = make_user("kiran@example.com", full_name="Kiran")
        first = self.order(2)
        self.recipient(first, priya)
        self.recipient(first, kiran)
        second = self.order(3)
        self.recipient(second, priya)
        self.order(10, payment_status=Order.PaymentStatus.FAILED, amount="900.00")
        self.order(10, payment_status=Order.PaymentStatus.PENDING, amount="900.00")
        response = self.client.get(reverse("admin-purchasers"))
        self.assertEqual(response.status_code, 200, response.data)
        self.assertEqual(response.data["pagination"]["count"], 2)
        rows = {row["id"]: row for row in response.data["data"]}
        for order, quantity in ((first, 2), (second, 3)):
            row = rows[order.pk]
            self.assertEqual(row["total_cards_purchased"], quantity)
            self.assertEqual(Decimal(row["total_amount_paid"]), Decimal("110.00"))
            self.assertEqual(row["total_cards_assigned"], 0)
            self.assertEqual(row["total_cards_activated"], 0)

    def test_detail_contains_only_selected_paid_order_and_each_recipient_contact(self):
        priya = make_user("priya@example.com", full_name="Priya")
        order = self.order(1)
        recipient = self.recipient(order, priya, name="Priya at purchase")
        self.order(2, payment_status=Order.PaymentStatus.FAILED)
        other = self.order(2)
        self.recipient(other, make_user("other-recipient@example.com"))
        response = self.client.get(reverse("admin-purchaser-detail", args=[order.pk]))
        self.assertEqual(response.status_code, 200, response.data)
        selected = response.data["data"]["order"]
        self.assertEqual(selected["id"], order.pk)
        self.assertEqual(len(selected["recipients"]), 1)
        row = selected["recipients"][0]
        self.assertEqual(row["id"], recipient.pk)
        self.assertEqual(row["name"], "Priya at purchase")
        self.assertEqual(row["phone"], "+447700900123")
        self.assertIsNone(row["assigned_card_uid"])
        self.assertEqual(row["activation_status"], "UNASSIGNED")
        self.assertEqual(row["profile_id"], priya.profile.pk)

    def test_purchaser_only_profile_is_excluded_from_customers(self):
        Profile.ensure_for_user(self.buyer)
        priya = make_user("priya@example.com", full_name="Priya")
        self.recipient(self.order(1), priya)
        response = self.client.get(reverse("admin-customers"))
        ids = [row["id"] for row in response.data["data"]]
        self.assertIn(priya.pk, ids)
        self.assertNotIn(self.buyer.pk, ids)
        self.assertEqual(self.client.get(reverse("admin-customer-detail", args=[self.buyer.pk])).status_code, 404)
        self.assertTrue(User.objects.filter(pk=self.buyer.pk).exists())
        self.assertTrue(Profile.objects.filter(user=self.buyer).exists())

    def test_purchaser_also_recipient_reuses_identity_in_both_directories(self):
        order = self.order(1)
        self.recipient(order, self.buyer)
        purchasers = self.client.get(reverse("admin-purchasers")).data["data"]
        customers = self.client.get(reverse("admin-customers")).data["data"]
        self.assertEqual([row["id"] for row in purchasers], [order.pk])
        self.assertEqual([row["customer_id"] for row in purchasers], [self.buyer.pk])
        self.assertEqual([row["id"] for row in customers], [self.buyer.pk])
        self.assertEqual(User.objects.filter(email__iexact=self.buyer.email).count(), 1)
        self.assertEqual(Profile.objects.filter(user=self.buyer).count(), 1)

    def test_legacy_customers_remain_visible(self):
        legacy = make_user("legacy@example.com")
        Profile.ensure_for_user(legacy)
        Profile.ensure_for_user(self.buyer)
        self.order(1)  # legacy paid order without recipient allocations
        response = self.client.get(reverse("admin-customers"))
        ids = {row["id"] for row in response.data["data"]}
        self.assertTrue({legacy.pk, self.buyer.pk}.issubset(ids))

    def test_customized_historical_profile_remains_customer_when_buying_for_others(self):
        profile = Profile.ensure_for_user(self.buyer)
        profile.company = "Rahul Consulting"
        profile.save(update_fields=["company"])
        priya = make_user("priya@example.com")
        self.recipient(self.order(1), priya)
        response = self.client.get(reverse("admin-customers"))
        self.assertIn(self.buyer.pk, [row["id"] for row in response.data["data"]])

    def test_existing_card_owner_remains_customer_when_buying_for_others(self):
        Profile.ensure_for_user(self.buyer)
        NfcCard.objects.create(uid="existing-buyer", serial_number="SN-BUYER", user=self.buyer, status="ACTIVE")
        priya = make_user("priya@example.com")
        self.recipient(self.order(1), priya)
        response = self.client.get(reverse("admin-customers"))
        self.assertIn(self.buyer.pk, [row["id"] for row in response.data["data"]])

    def test_assigned_and_activated_counts_are_distinct_from_purchased(self):
        priya = make_user("priya@example.com")
        card = NfcCard.objects.create(uid="active-priya", serial_number="SN-PRIYA", user=priya, status="ACTIVE")
        self.recipient(self.order(3), priya, card=card)
        row = self.client.get(reverse("admin-purchasers")).data["data"][0]
        self.assertEqual(row["total_cards_purchased"], 3)
        self.assertEqual(row["total_cards_assigned"], 1)
        self.assertEqual(row["total_cards_activated"], 1)

    def test_failed_only_account_is_not_a_paid_purchaser(self):
        orders = [self.order(2, payment_status=state) for state in
                  (Order.PaymentStatus.FAILED, Order.PaymentStatus.PENDING, Order.PaymentStatus.REFUNDED)]
        self.assertEqual(self.client.get(reverse("admin-purchasers")).data["pagination"]["count"], 0)
        for order in orders:
            self.assertEqual(self.client.get(reverse("admin-purchaser-detail", args=[order.pk])).status_code, 404)

    def test_search_pagination_and_empty_results(self):
        first = self.order(1)
        second = self.order(2, name="Another Name")
        response = self.client.get(reverse("admin-purchasers"), {"search": "RAHUL", "page_size": 1})
        self.assertEqual(response.data["pagination"]["count"], 2)  # Both retain the same purchaser email.
        self.assertEqual(response.data["pagination"]["num_pages"], 2)
        self.assertEqual(len(response.data["data"]), 1)
        response = self.client.get(reverse("admin-purchasers"), {"search": first.order_number})
        self.assertEqual([row["id"] for row in response.data["data"]], [first.pk])
        response = self.client.get(reverse("admin-purchasers"), {"search": str(first.pk)})
        self.assertIn(first.pk, [row["id"] for row in response.data["data"]])
        response = self.client.get(reverse("admin-purchasers"), {"search": "Another Name"})
        self.assertEqual([row["id"] for row in response.data["data"]], [second.pk])
        response = self.client.get(reverse("admin-purchasers"), {"search": "nobody"})
        self.assertEqual(response.data["data"], [])
        self.assertEqual(response.data["pagination"]["count"], 0)

    def test_dashboard_separates_customers_purchased_cards_and_inventory(self):
        Profile.ensure_for_user(self.buyer)
        priya = make_user("priya@example.com")
        card = NfcCard.objects.create(uid="dashboard-active", serial_number="DASH-ACTIVE", user=priya, status="ACTIVE")
        self.recipient(self.order(3), priya, card=card)
        NfcCard.objects.create(uid="dashboard-stock", serial_number="DASH-STOCK", status="UNASSIGNED")
        self.order(10, payment_status=Order.PaymentStatus.PENDING, amount="900.00")
        response = self.client.get(reverse("admin-dashboard"))
        self.assertEqual(response.status_code, 200, response.data)
        row = response.data["data"]
        self.assertEqual(row["total_customers"], 1)
        self.assertEqual(row["paid_purchaser_count"], 1)
        self.assertEqual(row["purchased_cards"], 3)
        self.assertEqual(row["total_cards"], 2)
        self.assertEqual(row["assigned_cards"], 1)
        self.assertEqual(row["activated_cards"], 1)
        self.assertEqual(row["available_inventory"], 1)
        self.assertEqual(Decimal(row["total_revenue"]), Decimal("110.00"))

    def test_purchaser_endpoints_require_admin(self):
        self.order(1)
        self.client.force_authenticate(self.buyer)
        self.assertEqual(self.client.get(reverse("admin-purchasers")).status_code, 403)
        self.assertEqual(self.client.get(reverse("admin-purchaser-detail", args=[self.buyer.pk])).status_code, 403)
        self.client.force_authenticate(None)
        self.assertIn(self.client.get(reverse("admin-purchasers")).status_code, (401, 403))
