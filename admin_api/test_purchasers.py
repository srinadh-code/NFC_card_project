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

    def order(self, quantity, buyer=None, payment_status=Order.PaymentStatus.PAID, amount="100.00"):
        order = Order.objects.create(customer=buyer or self.buyer, amount=amount, shipping="10.00", payment_status=payment_status,
            payment_method=Order.PaymentMethod.RAZORPAY, shipping_line1="123 Main St", shipping_city="Hyderabad",
            shipping_state="Telangana", shipping_pincode="500001")
        OrderItem.objects.create(order=order, product_id="custom", name="Custom card", card_type="CUSTOM", color="Black", qty=quantity, price="50.00")
        return order

    def recipient(self, order, user, name=None, card=None):
        return OrderRecipient.objects.create(order=order, user=user, profile=Profile.ensure_for_user(user),
            name=name or user.full_name, email=user.email, phone="+447700900123", assigned_card=card)

    def test_paid_summary_uses_quantities_not_joined_recipient_rows(self):
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
        self.assertEqual(response.data["pagination"]["count"], 1)
        row = response.data["data"][0]
        self.assertEqual(row["paid_order_count"], 2)
        self.assertEqual(row["total_cards_purchased"], 5)
        self.assertEqual(Decimal(row["total_amount_paid"]), Decimal("220.00"))
        self.assertEqual(row["total_cards_assigned"], 0)
        self.assertEqual(row["total_cards_activated"], 0)

    def test_detail_contains_only_paid_orders_and_each_recipient_contact(self):
        priya = make_user("priya@example.com", full_name="Priya")
        order = self.order(1)
        recipient = self.recipient(order, priya, name="Priya at purchase")
        self.order(2, payment_status=Order.PaymentStatus.FAILED)
        response = self.client.get(reverse("admin-purchaser-detail", args=[self.buyer.pk]))
        self.assertEqual(response.status_code, 200, response.data)
        orders = response.data["data"]["orders"]
        self.assertEqual(len(orders), 1)
        row = orders[0]["recipients"][0]
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
        self.assertEqual([row["id"] for row in purchasers], [self.buyer.pk])
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
        self.order(2, payment_status=Order.PaymentStatus.FAILED)
        self.assertEqual(self.client.get(reverse("admin-purchasers")).data["pagination"]["count"], 0)
        self.assertEqual(self.client.get(reverse("admin-purchaser-detail", args=[self.buyer.pk])).status_code, 404)

    def test_search_pagination_and_empty_results(self):
        self.order(1)
        response = self.client.get(reverse("admin-purchasers"), {"search": "RAHUL", "page_size": 1})
        self.assertEqual(response.data["pagination"]["count"], 1)
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
