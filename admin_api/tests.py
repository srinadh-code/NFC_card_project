from django.urls import reverse
from rest_framework import status
from rest_framework.test import APITestCase

from accounts.models import User
from common.test_utils import make_user
from profiles.models import Profile


class AdminAuthenticatedAPITestCase(APITestCase):
    """Base for admin_api tests: an ADMIN-role actor making the request,
    plus a separate CUSTOMER the admin acts on."""

    def setUp(self):
        super().setUp()
        self.admin = make_user(email="admin@example.com", role=User.Role.ADMIN, is_staff=True)
        self.customer = make_user(email="admin-target-customer@example.com")
        self.client.force_authenticate(user=self.admin)


class AdminOrderCreateGoogleReviewCardTests(AdminAuthenticatedAPITestCase):
    """An admin entering an offline order must be able to record a Google
    Review Card purchase, not just an NFC card one — see
    admin_api.orders.serializers.OrderItemWriteSerializer, which used to
    only accept NfcCard.CardType.choices (CUSTOM/WOODEN)."""

    def test_admin_can_create_an_order_for_a_google_review_card(self):
        payload = {
            "customer_email": self.customer.email,
            "items": [
                {
                    "product_id": "PRD-NEXORA-GOOGLE-REVIEW",
                    "name": "Google Review Card",
                    "card_type": "REVIEW",
                    "color": "Black",
                    "qty": 1,
                    "price": "499.00",
                }
            ],
            "payment_method": "COD",
            "shipping_line1": "123 Main St",
            "shipping_city": "Hyderabad",
            "shipping_state": "Telangana",
            "shipping_pincode": "500001",
        }
        response = self.client.post(reverse("admin-orders"), payload, format="json")

        self.assertEqual(response.status_code, status.HTTP_201_CREATED, response.data)
        self.assertEqual(response.data["data"]["items"][0]["card_type"], "REVIEW")

    def test_admin_can_still_create_an_order_for_a_custom_nfc_card(self):
        """Regression check: widening the choice list must not have
        narrowed or otherwise broken the existing NFC-card path."""
        payload = {
            "customer_email": self.customer.email,
            "items": [
                {
                    "product_id": "PRD-NEXORA-CUSTOM",
                    "name": "NEXORA Custom",
                    "card_type": "CUSTOM",
                    "color": "Black",
                    "qty": 1,
                    "price": "999.00",
                }
            ],
            "payment_method": "COD",
            "shipping_line1": "123 Main St",
            "shipping_city": "Hyderabad",
            "shipping_state": "Telangana",
            "shipping_pincode": "500001",
        }
        response = self.client.post(reverse("admin-orders"), payload, format="json")

        self.assertEqual(response.status_code, status.HTTP_201_CREATED, response.data)
        self.assertEqual(response.data["data"]["items"][0]["card_type"], "CUSTOM")

    def test_still_rejects_a_retired_card_type(self):
        payload = {
            "customer_email": self.customer.email,
            "items": [
                {
                    "product_id": "p1",
                    "name": "Classic Card",
                    "card_type": "CLASSIC",
                    "color": "Black",
                    "qty": 1,
                    "price": "499.00",
                }
            ],
            "payment_method": "COD",
            "shipping_line1": "123 Main St",
            "shipping_city": "Hyderabad",
            "shipping_state": "Telangana",
            "shipping_pincode": "500001",
        }
        response = self.client.post(reverse("admin-orders"), payload, format="json")

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)


class AdminProfileGoogleReviewUrlTests(AdminAuthenticatedAPITestCase):
    """There's no customer-facing settings field for a Google Review
    destination link yet (see the QR Code page's Google Review Card
    section, which reports it as "not set up"), so an admin editing the
    customer's profile is the one place this can actually be configured
    today."""

    def setUp(self):
        super().setUp()
        self.profile = Profile.ensure_for_user(self.customer)

    def test_admin_can_set_the_google_review_url(self):
        url = reverse("admin-profile-detail", args=[self.profile.pk])
        response = self.client.patch(
            url, {"google_review_url": "https://g.page/r/example-business/review"}, format="json"
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
        self.assertEqual(response.data["data"]["google_review_url"], "https://g.page/r/example-business/review")
        self.profile.refresh_from_db()
        self.assertEqual(self.profile.google_review_url, "https://g.page/r/example-business/review")

    def test_blank_by_default(self):
        response = self.client.get(reverse("admin-profile-detail", args=[self.profile.pk]))
        self.assertEqual(response.data["data"]["google_review_url"], "")
