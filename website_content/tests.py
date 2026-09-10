from django.urls import reverse
from rest_framework import status
from rest_framework.test import APITestCase

from common.test_utils import make_user

from .models import GeneralSettings


class GeneralSettingsPublicViewTests(APITestCase):
    """The public read endpoint that drives the public website's header/
    footer/contact info — must work with no auth and never expose the
    admin-only write endpoint."""

    def test_returns_seeded_defaults_with_no_auth(self):
        response = self.client.get(reverse("public-settings"))

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        data = response.data["data"]
        self.assertEqual(data["site_name"], "VR's NEXORA")
        self.assertEqual(data["site_email"], "support@vrsnexora.com")
        self.assertEqual(set(data.keys()), {
            "site_name", "site_email", "site_phone", "site_address", "currency", "timezone",
        })

    def test_reflects_admin_updates(self):
        obj = GeneralSettings.objects.first()
        obj.site_name = "ABC Digital"
        obj.site_email = "hello@abcdigital.com"
        obj.save()

        response = self.client.get(reverse("public-settings"))

        self.assertEqual(response.data["data"]["site_name"], "ABC Digital")
        self.assertEqual(response.data["data"]["site_email"], "hello@abcdigital.com")


class GeneralSettingsAdminViewTests(APITestCase):
    def setUp(self):
        super().setUp()
        self.admin = make_user(email="admin@example.com", role="ADMIN")
        self.customer = make_user(email="customer2@example.com")

    def test_requires_authentication(self):
        response = self.client.get(reverse("admin-settings"))
        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_requires_admin_role(self):
        self.client.force_authenticate(user=self.customer)
        response = self.client.get(reverse("admin-settings"))
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_admin_can_update_settings(self):
        self.client.force_authenticate(user=self.admin)
        payload = {
            "site_name": "ABC Digital",
            "site_email": "hello@abcdigital.com",
            "site_phone": "+91 98765 43210",
            "site_address": "Bengaluru, Karnataka, India",
            "currency": "USD",
            "timezone": "UTC",
        }

        response = self.client.put(reverse("admin-settings"), payload, format="json")

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        data = response.data["data"]
        self.assertEqual(data["site_name"], "ABC Digital")
        self.assertEqual(data["currency"], "USD")

        # Persisted — a second request (simulating a page refresh) sees the same values.
        refreshed = self.client.get(reverse("admin-settings"))
        self.assertEqual(refreshed.data["data"]["site_email"], "hello@abcdigital.com")

    def test_invalid_email_is_rejected(self):
        self.client.force_authenticate(user=self.admin)
        response = self.client.patch(reverse("admin-settings"), {"site_email": "not-an-email"}, format="json")
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
