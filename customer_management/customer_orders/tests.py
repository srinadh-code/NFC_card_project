from django.urls import reverse
from rest_framework import status

from common.test_utils import AuthenticatedAPITestCase
from customer_management.customer_notifications.models import Notification

from .models import Order


def _valid_payload(**overrides):
    payload = {
        "shipping_full_name": "Jane Doe",
        "shipping_phone": "+919876543210",
        "shipping_address": "123 Main St",
        "shipping_city": "Hyderabad",
        "shipping_state": "Telangana",
        "shipping_country": "India",
        "shipping_postal_code": "500001",
        "items": [{"card_type": "STANDARD", "color": "Black", "quantity": 2, "unit_price": "499.00"}],
    }
    payload.update(overrides)
    return payload


class CreateOrderViewTests(AuthenticatedAPITestCase):
    def test_creates_order_with_computed_totals(self):
        response = self.client.post(reverse("customer-orders"), _valid_payload(), format="json")

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        data = response.data["data"]
        self.assertEqual(data["status"], "PENDING")
        self.assertEqual(str(data["subtotal"]), "998.00")
        self.assertEqual(str(data["total"]), "998.00")
        self.assertEqual(len(data["items"]), 1)
        self.assertEqual(len(data["status_history"]), 1)
        self.assertEqual(data["status_history"][0]["status"], "PENDING")
        self.assertEqual(
            Notification.objects.filter(user=self.user, type=Notification.Type.ORDER_UPDATE).count(), 1
        )

    def test_applies_discount(self):
        response = self.client.post(
            reverse("customer-orders"), _valid_payload(discount="100.00"), format="json"
        )
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(str(response.data["data"]["total"]), "898.00")

    def test_rejects_discount_greater_than_subtotal(self):
        response = self.client.post(
            reverse("customer-orders"), _valid_payload(discount="9999.00"), format="json"
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_rejects_order_with_no_items(self):
        response = self.client.post(reverse("customer-orders"), _valid_payload(items=[]), format="json")
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_rejects_non_positive_unit_price(self):
        payload = _valid_payload()
        payload["items"][0]["unit_price"] = "0.00"
        response = self.client.post(reverse("customer-orders"), payload, format="json")
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_requires_authentication(self):
        self.client.force_authenticate(user=None)
        response = self.client.post(reverse("customer-orders"), _valid_payload(), format="json")
        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)


class OrderListDetailViewTests(AuthenticatedAPITestCase):
    def test_list_only_returns_own_orders(self):
        self.client.post(reverse("customer-orders"), _valid_payload(), format="json")
        self.client.force_authenticate(user=self.other_user)
        self.client.post(reverse("customer-orders"), _valid_payload(), format="json")
        self.client.force_authenticate(user=self.user)

        response = self.client.get(reverse("customer-orders"))

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(len(response.data["data"]), 1)

    def test_detail_returns_own_order(self):
        create_response = self.client.post(reverse("customer-orders"), _valid_payload(), format="json")
        order_id = create_response.data["data"]["id"]

        response = self.client.get(reverse("customer-order-detail", args=[order_id]))

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["data"]["order_number"], Order.objects.get(pk=order_id).order_number)

    def test_detail_404_for_another_users_order(self):
        create_response = self.client.post(reverse("customer-orders"), _valid_payload(), format="json")
        order_id = create_response.data["data"]["id"]

        self.client.force_authenticate(user=self.other_user)
        response = self.client.get(reverse("customer-order-detail", args=[order_id]))

        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)

    def test_status_change_is_appended_to_history(self):
        create_response = self.client.post(reverse("customer-orders"), _valid_payload(), format="json")
        order = Order.objects.get(pk=create_response.data["data"]["id"])

        order.status = Order.Status.CONFIRMED
        order.save()

        response = self.client.get(reverse("customer-order-detail", args=[order.id]))
        statuses = [entry["status"] for entry in response.data["data"]["status_history"]]
        self.assertEqual(statuses, ["PENDING", "CONFIRMED"])
        self.assertEqual(
            Notification.objects.filter(user=self.user, type=Notification.Type.ORDER_UPDATE).count(), 2
        )
