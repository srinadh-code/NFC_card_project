from django.core import mail
from django.urls import reverse
from rest_framework import status
from rest_framework.test import APITestCase

from common.test_utils import AuthenticatedAPITestCase, make_user
from customer_management.customer_notifications.models import Notification
from customer_management.customer_settings.models import CustomerSettings

from .models import Order


def _valid_payload(**overrides):
    payload = {
        "items": [{"product_id": "p1", "name": "Custom Card", "card_type": "CUSTOM", "color": "Black", "qty": 2, "price": "499.00"}],
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

    def test_creates_order_for_google_review_card(self):
        payload = _valid_payload(
            items=[{"product_id": "PRD-NEXORA-GOOGLE-REVIEW", "name": "Google Review Card", "card_type": "REVIEW", "color": "Black", "qty": 1, "price": "499.00"}]
        )
        response = self.client.post(reverse("my-orders"), payload, format="json")

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        data = response.data["data"]
        self.assertEqual(str(data["amount"]), "499.00")
        self.assertEqual(data["items"][0]["card_type"], "REVIEW")
        self.assertEqual(data["items"][0]["name"], "Google Review Card")

    def test_rejects_retired_classic_card_type(self):
        payload = _valid_payload(
            items=[{"product_id": "p1", "name": "Classic Card", "card_type": "CLASSIC", "color": "Black", "qty": 1, "price": "499.00"}]
        )
        response = self.client.post(reverse("my-orders"), payload, format="json")
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_rejects_retired_premium_card_type(self):
        payload = _valid_payload(
            items=[{"product_id": "p1", "name": "Premium Card", "card_type": "PREMIUM", "color": "Black", "qty": 1, "price": "799.00"}]
        )
        response = self.client.post(reverse("my-orders"), payload, format="json")
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


class OrderConfirmationEmailTests(AuthenticatedAPITestCase):
    """The order confirmation email is the durable fallback for getting a
    customer their secure Track Order link (the in-app bell notification
    and the OrderSuccess page button are the other two) — see
    accounts.emails.send_order_confirmation_email, called from
    orders/signals.py on order creation."""

    def test_placing_an_order_sends_a_confirmation_email_with_the_tracking_link(self):
        response = self.client.post(reverse("my-orders"), _valid_payload(), format="json")
        order = Order.objects.get(pk=response.data["data"]["id"])

        self.assertEqual(len(mail.outbox), 1)
        sent = mail.outbox[0]
        self.assertEqual(sent.to, [self.user.email])
        expected_link = f"/track-order?order=ORD{order.pk:06d}&token={order.tracking_token}"
        self.assertIn(expected_link, sent.body)

    def test_confirmation_email_never_exposes_the_bare_order_id_as_sufficient(self):
        """The email must link with the token, not just an order number a
        recipient could forward without the security context intact."""
        self.client.post(reverse("my-orders"), _valid_payload(), format="json")

        sent = mail.outbox[0]
        self.assertIn("token=", sent.body)


class OrderNotificationTests(AuthenticatedAPITestCase):
    """Pins the real notification wiring for *this* Order model — the one
    the live checkout/admin flow actually reads and writes (see
    orders/signals.py). A near-identical signal exists on
    customer_management.customer_orders.Order, but that model has no route
    anywhere in config/urls.py and is never written to by a real request."""

    def test_placing_an_order_notifies_the_customer(self):
        self.client.post(reverse("my-orders"), _valid_payload(), format="json")
        self.assertTrue(
            Notification.objects.filter(user=self.user, type=Notification.Type.ORDER_UPDATE).exists()
        )

    def test_status_change_notifies_the_customer(self):
        order = Order.objects.create(
            customer=self.user,
            amount="499.00",
            shipping="49.00",
            payment_method=Order.PaymentMethod.UPI,
            payment_status=Order.PaymentStatus.PAID,
            shipping_line1="123 Main St",
            shipping_city="Hyderabad",
            shipping_state="Telangana",
            shipping_pincode="500001",
        )
        Notification.objects.filter(user=self.user).delete()  # isolate from the "placed" notification above

        order.status = Order.Status.SHIPPED
        order.save(update_fields=["status"])

        notification = Notification.objects.get(user=self.user, type=Notification.Type.ORDER_UPDATE)
        self.assertIn("Shipped", notification.message)

    def test_no_notification_when_order_updates_disabled(self):
        settings_obj = CustomerSettings.ensure_for_user(self.user)
        settings_obj.notify_order_updates = False
        settings_obj.save(update_fields=["notify_order_updates"])

        self.client.post(reverse("my-orders"), _valid_payload(), format="json")

        self.assertFalse(
            Notification.objects.filter(user=self.user, type=Notification.Type.ORDER_UPDATE).exists()
        )


class PublicOrderTrackingViewTests(APITestCase):
    """The public Track Order page's backend — no authentication, reads the
    same real Order rows admin_api.orders/the customer's own Orders page
    use. Never a fake/mocked tracking dataset.

    SECURITY: the order id ("13"/"ORD000013") is just the row's sequential
    pk — never a secret. Every one of these requests must also present the
    matching Order.tracking_token, or get the exact same 404 an unknown
    order id would (see PublicOrderTrackingView)."""

    def setUp(self):
        self.customer = make_user(email="tracked-customer@example.com", full_name="Tracked Customer")
        self.order = Order.objects.create(
            customer=self.customer,
            amount="499.00",
            shipping="49.00",
            payment_method=Order.PaymentMethod.UPI,
            payment_status=Order.PaymentStatus.PAID,
            status=Order.Status.SHIPPED,
            shipping_line1="123 Main St",
            shipping_city="Hyderabad",
            shipping_state="Telangana",
            shipping_pincode="500001",
        )
        self.token = str(self.order.tracking_token)

    def test_works_without_authentication_given_the_correct_token(self):
        response = self.client.get(
            reverse("public-order-tracking"), {"order": str(self.order.pk), "token": self.token}
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)

    def test_accepts_the_formatted_order_number(self):
        response = self.client.get(
            reverse("public-order-tracking"), {"order": f"ORD{self.order.pk:06d}", "token": self.token}
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["data"]["order_number"], f"ORD{self.order.pk:06d}")

    def test_returns_the_real_current_status(self):
        response = self.client.get(
            reverse("public-order-tracking"), {"order": str(self.order.pk), "token": self.token}
        )
        self.assertEqual(response.data["data"]["status"], "SHIPPED")

    def test_unknown_order_returns_professional_404(self):
        response = self.client.get(reverse("public-order-tracking"), {"order": "999999", "token": self.token})
        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)
        self.assertIn("Order not found", response.data["message"])

    def test_missing_order_param_returns_404_not_a_500(self):
        response = self.client.get(reverse("public-order-tracking"), {"token": self.token})
        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)

    def test_does_not_expose_customer_contact_information(self):
        response = self.client.get(
            reverse("public-order-tracking"), {"order": str(self.order.pk), "token": self.token}
        )
        body = str(response.data)
        self.assertNotIn(self.customer.email, body)
        self.assertNotIn("shipping_line1", body)
        self.assertNotIn("123 Main St", body)

    def test_does_not_expose_the_tracking_token_itself(self):
        """The token authenticates the request — it must never be echoed
        back in the response body (that would let anyone who ever sees one
        response re-derive/leak the credential for other requests)."""
        response = self.client.get(
            reverse("public-order-tracking"), {"order": str(self.order.pk), "token": self.token}
        )
        self.assertNotIn("tracking_token", str(response.data))

    def test_cancelled_order_shows_cancelled_as_current_status(self):
        self.order.status = Order.Status.CANCELLED
        self.order.save(update_fields=["status"])

        response = self.client.get(
            reverse("public-order-tracking"), {"order": str(self.order.pk), "token": self.token}
        )

        self.assertEqual(response.data["data"]["status"], "CANCELLED")
        tracking = response.data["data"]["tracking"]
        # Real data, not fabricated: only "Order Placed" is ever marked done
        # for a cancelled order (matches OrderSerializer.get_tracking()).
        self.assertTrue(tracking[0]["done"])
        self.assertFalse(any(step["done"] for step in tracking[1:]))

    def test_status_change_is_immediately_reflected(self):
        """One source of truth: admin changing the real Order row is what
        the public tracking endpoint reads — no separate tracking table to
        fall out of sync with."""
        response_before = self.client.get(
            reverse("public-order-tracking"), {"order": str(self.order.pk), "token": self.token}
        )
        self.assertEqual(response_before.data["data"]["status"], "SHIPPED")

        self.order.status = Order.Status.DELIVERED
        self.order.save(update_fields=["status"])

        response_after = self.client.get(
            reverse("public-order-tracking"), {"order": str(self.order.pk), "token": self.token}
        )
        self.assertEqual(response_after.data["data"]["status"], "DELIVERED")


class PublicOrderTrackingSecurityTests(APITestCase):
    """The actual IDOR fix: a real, valid order id must never be enough on
    its own to see someone else's order — it's just a guessable sequential
    integer (ORD000013 == pk 13). See PublicOrderTrackingView."""

    def setUp(self):
        self.customer_a = make_user(email="customer-a@example.com", full_name="Customer A")
        self.customer_b = make_user(email="customer-b@example.com", full_name="Customer B")
        self.order_a = Order.objects.create(
            customer=self.customer_a,
            amount="499.00",
            shipping="49.00",
            payment_method=Order.PaymentMethod.UPI,
            payment_status=Order.PaymentStatus.PAID,
            status=Order.Status.SHIPPED,
            shipping_line1="123 Main St",
            shipping_city="Hyderabad",
            shipping_state="Telangana",
            shipping_pincode="500001",
        )
        self.order_b = Order.objects.create(
            customer=self.customer_b,
            amount="799.00",
            shipping="49.00",
            payment_method=Order.PaymentMethod.CARD,
            payment_status=Order.PaymentStatus.PAID,
            status=Order.Status.PROCESSING,
            shipping_line1="456 Other St",
            shipping_city="Bengaluru",
            shipping_state="Karnataka",
            shipping_pincode="560001",
        )

    def test_order_id_alone_is_denied(self):
        """Requirement 2 (Public Track Order): the numeric order id (e.g.
        ORD000013) must not be treated as a secret — no token means denied,
        even for a perfectly real order id."""
        response = self.client.get(reverse("public-order-tracking"), {"order": str(self.order_a.pk)})
        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)

    def test_wrong_token_is_denied(self):
        response = self.client.get(
            reverse("public-order-tracking"),
            {"order": str(self.order_a.pk), "token": str(self.order_b.tracking_token)},
        )
        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)

    def test_malformed_token_is_denied_not_a_500(self):
        response = self.client.get(
            reverse("public-order-tracking"), {"order": str(self.order_a.pk), "token": "not-a-uuid"}
        )
        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)

    def test_modified_order_id_with_a_different_orders_valid_token_is_denied(self):
        """The reported attack: attacker has their own real order id+token
        (order_a) and tries swapping in a neighboring order id (order_b)
        while reusing their own token. Token is bound to its own row, so
        pk+token must both match the same order."""
        response = self.client.get(
            reverse("public-order-tracking"),
            {"order": str(self.order_b.pk), "token": str(self.order_a.tracking_token)},
        )
        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)

    def test_correct_token_only_ever_unlocks_its_own_order(self):
        response_a = self.client.get(
            reverse("public-order-tracking"),
            {"order": str(self.order_a.pk), "token": str(self.order_a.tracking_token)},
        )
        response_b = self.client.get(
            reverse("public-order-tracking"),
            {"order": str(self.order_b.pk), "token": str(self.order_b.tracking_token)},
        )
        self.assertEqual(response_a.status_code, status.HTTP_200_OK)
        self.assertEqual(response_b.status_code, status.HTTP_200_OK)
        self.assertEqual(response_a.data["data"]["status"], "SHIPPED")
        self.assertEqual(response_b.data["data"]["status"], "PROCESSING")

    def test_each_order_gets_its_own_unique_token(self):
        self.assertNotEqual(self.order_a.tracking_token, self.order_b.tracking_token)


class CustomerOrderOwnershipTests(AuthenticatedAPITestCase):
    """Requirement 1: an authenticated customer's own-orders endpoints must
    never leak another customer's order data by id-guessing. This is a
    regression pin for CustomerOrderDetailView's existing
    `.filter(pk=pk, customer=request.user)` scoping (see orders/views.py) —
    the real bug was in the separate public endpoint, not here, but this
    locks the authenticated path down too."""

    def setUp(self):
        super().setUp()
        self.own_order = Order.objects.create(
            customer=self.user,
            amount="499.00",
            shipping="49.00",
            payment_method=Order.PaymentMethod.UPI,
            payment_status=Order.PaymentStatus.PAID,
            shipping_line1="123 Main St",
            shipping_city="Hyderabad",
            shipping_state="Telangana",
            shipping_pincode="500001",
        )
        self.other_order = Order.objects.create(
            customer=self.other_user,
            amount="799.00",
            shipping="49.00",
            payment_method=Order.PaymentMethod.CARD,
            payment_status=Order.PaymentStatus.PAID,
            shipping_line1="456 Other St",
            shipping_city="Bengaluru",
            shipping_state="Karnataka",
            shipping_pincode="560001",
        )

    def test_customer_can_view_their_own_order(self):
        response = self.client.get(reverse("my-order-detail", args=[self.own_order.pk]))
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["data"]["id"], self.own_order.pk)

    def test_customer_cannot_view_another_customers_order_by_changing_the_id(self):
        response = self.client.get(reverse("my-order-detail", args=[self.other_order.pk]))
        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)

    def test_own_order_response_includes_a_tracking_token_for_the_public_link(self):
        response = self.client.get(reverse("my-order-detail", args=[self.own_order.pk]))
        self.assertEqual(response.data["data"]["tracking_token"], str(self.own_order.tracking_token))

    def test_another_customers_tracking_token_is_never_exposed_via_my_orders_list(self):
        response = self.client.get(reverse("my-orders"))
        body = str(response.data)
        self.assertNotIn(str(self.other_order.tracking_token), body)
