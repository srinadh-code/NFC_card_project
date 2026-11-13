"""Security regression checks for the mounted, canonical orders API.

Expected failures explicitly track findings awaiting approval; they are not
evidence of a completed fix. All records live in Django's disposable test DB.
"""
from decimal import Decimal
from unittest import expectedFailure, mock

from django.test import tag
from django.urls import reverse

from common import discounts
from common.test_utils import AuthenticatedAPITestCase
from orders import tests as fixtures
from orders.models import Order


class OrderOwnershipSecurityTests(AuthenticatedAPITestCase):
    def setUp(self):
        super().setUp()
        self.address = fixtures._make_address(self.user)
        self.other_address = fixtures._make_address(self.other_user)
        self.other_order = Order.objects.create(
            customer=self.other_user, amount="999.00", shipping="0.00",
            payment_method="COD", payment_status="PENDING",
            shipping_line1="Private street", shipping_city="Hyderabad",
            shipping_state="Telangana", shipping_pincode="500001",
        )

    def test_foreign_order_read_cancel_and_mutations_preserve_record(self):
        detail = reverse("my-order-detail", args=[self.other_order.pk])
        self.assertEqual(self.client.get(detail).status_code, 404)
        self.assertEqual(self.client.post(reverse("my-order-cancel", args=[self.other_order.pk])).status_code, 404)
        for method in ("put", "patch", "delete"):
            with self.subTest(method=method):
                response = getattr(self.client, method)(detail, {"customer_id": self.user.pk, "payment_status": "PAID"}, format="json")
                self.assertEqual(response.status_code, 405)
        self.other_order.refresh_from_db()
        self.assertEqual((self.other_order.customer_id, self.other_order.status, self.other_order.payment_status), (self.other_user.pk, "PENDING", "PENDING"))

    def test_foreign_address_and_client_payment_claim_are_rejected(self):
        fixtures._seed_cart_item(self.user, qty=1)
        foreign_address = fixtures._valid_payload(self.address, address_id=self.other_address.pk)
        self.assertEqual(self.client.post(reverse("my-orders"), foreign_address, format="json").status_code, 400)
        for method in ("RAZORPAY", "DUMMY", "CARD", "UPI", "NET_BANKING"):
            with self.subTest(method=method):
                payload = fixtures._valid_payload(self.address, payment_method=method, payment_status="PAID")
                self.assertEqual(self.client.post(reverse("my-orders"), payload, format="json").status_code, 400)
        self.assertEqual(Order.objects.count(), 1)

    def test_cod_shipping_comes_from_server_even_when_client_submits_fee(self):
        """Legacy fee values cannot increase or reduce the server total."""
        with mock.patch.object(discounts, "FIRST_ORDER_DISCOUNT_ENABLED", False):
            for batch, fee in enumerate(("-999.00", "49.00", "0.00"), start=1):
                with self.subTest(fee=fee):
                    fixtures._seed_cart_item(self.user, qty=1)
                    payload = fixtures._valid_payload(self.address, recipient_batch=batch, shipping=fee)
                    response = self.client.post(reverse("my-orders"), payload, format="json")
                    self.assertEqual(response.status_code, 201, response.content)
                    order = Order.objects.get(pk=response.data["data"]["id"])
                    self.assertEqual(order.shipping, Decimal("0.00"))
                    self.assertEqual(order.total, Decimal("999.00"))
                    self.assertEqual(order.transactions.get().amount, order.total)

    def test_both_public_tracking_routes_share_ip_limit_even_after_sign_in(self):
        self.client.force_authenticate(None)
        public_url = reverse("public-track-order", args=[self.other_order.order_number])
        token_url = reverse("public-order-tracking") + f"?order={self.other_order.pk}&token={self.other_order.tracking_token}"
        for attempt in range(60):
            response = self.client.get(public_url if attempt % 2 == 0 else token_url)
            self.assertEqual(response.status_code, 200, response.content)
        self.assertEqual(self.client.get(public_url).status_code, 429)
        self.client.force_authenticate(self.user)
        self.assertEqual(self.client.get(token_url).status_code, 429)
        self.assertEqual(self.client.get(public_url, REMOTE_ADDR="192.0.2.19").status_code, 200)

    @tag("pending_security_approval")
    @expectedFailure
    def test_short_public_tracking_code_does_not_expose_payment_information(self):
        """Open finding: a six-digit public code exposes private payment data."""
        self.client.force_authenticate(None)
        response = self.client.get(reverse("public-track-order", args=[self.other_order.order_number]))
        self.assertEqual(response.status_code, 200)
        body = response.data["data"]
        self.assertFalse({"amount", "total", "payment_status", "items"} & body.keys())
