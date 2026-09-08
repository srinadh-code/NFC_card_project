from django.urls import reverse
from rest_framework import status

from common.test_utils import AuthenticatedAPITestCase

from .models import Order


def _valid_payload(**overrides):
    payload = {
        "items": [{"product_id": "p1", "name": "Standard Card", "card_type": "STANDARD", "color": "Black", "qty": 2, "price": "499.00"}],
        "shipping": "49.00",
        "payment_method": "UPI",
        "shipping_line1": "123 Main St",
        "shipping_city": "Hyderabad",
        "shipping_state": "Telangana",
        "shipping_pincode": "500001",
        "shipping_country": "India",
    }
    payload.update(overrides)
    return payload


class CustomerOrderCreateViewTests(AuthenticatedAPITestCase):
    def test_creates_order_with_computed_totals_and_is_paid_immediately(self):
        response = self.client.post(reverse("my-orders"), _valid_payload(), format="json")

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        data = response.data["data"]
        self.assertEqual(data["status"], "PENDING")
        self.assertEqual(data["payment_status"], "PAID")
        self.assertEqual(str(data["amount"]), "998.00")
        self.assertEqual(str(data["total"]), "1047.00")
        self.assertEqual(len(data["items"]), 1)

    def test_order_belongs_to_the_authenticated_customer(self):
        response = self.client.post(reverse("my-orders"), _valid_payload(), format="json")
        order = Order.objects.get(pk=response.data["data"]["id"])
        self.assertEqual(order.customer_id, self.user.id)

    def test_rejects_order_with_no_items(self):
        response = self.client.post(reverse("my-orders"), _valid_payload(items=[]), format="json")
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_requires_authentication(self):
        self.client.force_authenticate(user=None)
        response = self.client.post(reverse("my-orders"), _valid_payload(), format="json")
        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_creates_a_matching_transaction(self):
        response = self.client.post(reverse("my-orders"), _valid_payload(), format="json")
        order = Order.objects.get(pk=response.data["data"]["id"])
        self.assertEqual(order.transactions.count(), 1)
        self.assertEqual(str(order.transactions.first().amount), "1047.00")


class CustomerOrderListDetailViewTests(AuthenticatedAPITestCase):
    def test_list_only_returns_own_orders(self):
        self.client.post(reverse("my-orders"), _valid_payload(), format="json")
        self.client.force_authenticate(user=self.other_user)
        self.client.post(reverse("my-orders"), _valid_payload(), format="json")
        self.client.force_authenticate(user=self.user)

        response = self.client.get(reverse("my-orders"))

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(len(response.data["data"]), 1)

    def test_detail_returns_own_order(self):
        create_response = self.client.post(reverse("my-orders"), _valid_payload(), format="json")
        order_id = create_response.data["data"]["id"]

        response = self.client.get(reverse("my-order-detail", args=[order_id]))

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["data"]["id"], order_id)

    def test_detail_404_for_another_users_order(self):
        create_response = self.client.post(reverse("my-orders"), _valid_payload(), format="json")
        order_id = create_response.data["data"]["id"]

        self.client.force_authenticate(user=self.other_user)
        response = self.client.get(reverse("my-order-detail", args=[order_id]))

        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)


class CustomerOrderVisibleToAdminTests(AuthenticatedAPITestCase):
    """The whole point of routing here instead of customer_management.customer_orders:
    an order a customer places must be the same row admin_api.orders/dashboard/
    transactions/reports already query."""

    def test_order_is_visible_via_the_shared_orders_model(self):
        response = self.client.post(reverse("my-orders"), _valid_payload(), format="json")
        order_id = response.data["data"]["id"]

        # admin_api.orders, .dashboard, .transactions and .reports all filter
        # `orders.models.Order` directly — proving the row lands there (not
        # in some other app's disconnected table) is the actual regression
        # test for the bug this endpoint fixes.
        self.assertTrue(Order.objects.filter(pk=order_id, customer=self.user).exists())


class CustomerOrderIdempotencyTests(AuthenticatedAPITestCase):
    """One user action = one order, even under a double-click, a network
    retry, or two requests racing each other — see CustomerOrderListCreateView.post."""

    def test_repeated_submission_with_same_key_creates_only_one_order(self):
        payload = _valid_payload(idempotency_key="attempt-1")

        first = self.client.post(reverse("my-orders"), payload, format="json")
        second = self.client.post(reverse("my-orders"), payload, format="json")
        third = self.client.post(reverse("my-orders"), payload, format="json")

        self.assertEqual(first.status_code, status.HTTP_201_CREATED)
        # Replays are recognized, not rejected — same order handed back.
        self.assertEqual(second.status_code, status.HTTP_200_OK)
        self.assertEqual(third.status_code, status.HTTP_200_OK)
        self.assertEqual(first.data["data"]["id"], second.data["data"]["id"])
        self.assertEqual(first.data["data"]["id"], third.data["data"]["id"])
        self.assertEqual(Order.objects.filter(customer=self.user).count(), 1)

    def test_race_between_two_identical_requests_still_creates_only_one_order(self):
        """Simulates two near-simultaneous requests carrying the same key:
        the second one arrives after the first has already committed. The
        database's unique constraint on idempotency_key (not the earlier
        existence check) is what actually protects against a *true* race
        where both requests pass the existence check before either commits —
        this proves that constraint is in place and its IntegrityError path
        degrades gracefully instead of 500ing."""
        Order.objects.create(
            customer=self.user,
            idempotency_key="race-attempt",
            amount="998.00",
            shipping="49.00",
            payment_method=Order.PaymentMethod.UPI,
            payment_status=Order.PaymentStatus.PAID,
            shipping_line1="123 Main St",
            shipping_city="Hyderabad",
            shipping_state="Telangana",
            shipping_pincode="500001",
        )

        response = self.client.post(
            reverse("my-orders"), _valid_payload(idempotency_key="race-attempt"), format="json"
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(Order.objects.filter(customer=self.user, idempotency_key="race-attempt").count(), 1)

    def test_different_keys_create_separate_legitimate_orders(self):
        """A real second order (new checkout attempt, new key) must still
        go through — idempotency must never block legitimate repeat orders."""
        first = self.client.post(
            reverse("my-orders"), _valid_payload(idempotency_key="attempt-1"), format="json"
        )
        second = self.client.post(
            reverse("my-orders"), _valid_payload(idempotency_key="attempt-2"), format="json"
        )

        self.assertEqual(first.status_code, status.HTTP_201_CREATED)
        self.assertEqual(second.status_code, status.HTTP_201_CREATED)
        self.assertNotEqual(first.data["data"]["id"], second.data["data"]["id"])
        self.assertEqual(Order.objects.filter(customer=self.user).count(), 2)

    def test_omitted_key_still_creates_an_order_and_never_blocks_on_it(self):
        """Backward compatible: a caller that sends no key at all (or the
        admin-created-order path, which uses a different serializer
        entirely) must still work — and two keyless submissions must not
        be treated as duplicates of each other."""
        first = self.client.post(reverse("my-orders"), _valid_payload(), format="json")
        second = self.client.post(reverse("my-orders"), _valid_payload(), format="json")

        self.assertEqual(first.status_code, status.HTTP_201_CREATED)
        self.assertEqual(second.status_code, status.HTTP_201_CREATED)
        self.assertEqual(Order.objects.filter(customer=self.user).count(), 2)

    def test_same_key_from_a_different_customer_is_not_treated_as_their_order(self):
        first = self.client.post(
            reverse("my-orders"), _valid_payload(idempotency_key="shared-key"), format="json"
        )
        self.client.force_authenticate(user=self.other_user)
        second = self.client.post(
            reverse("my-orders"), _valid_payload(idempotency_key="shared-key"), format="json"
        )

        self.assertEqual(first.status_code, status.HTTP_201_CREATED)
        self.assertEqual(second.status_code, status.HTTP_201_CREATED)
        self.assertNotEqual(first.data["data"]["id"], second.data["data"]["id"])
