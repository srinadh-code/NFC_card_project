from django.urls import reverse
from rest_framework import status

from common.test_utils import AuthenticatedAPITestCase

from .models import CustomerSettings


class CustomerSettingsViewTests(AuthenticatedAPITestCase):
    def test_get_creates_defaults_on_first_access(self):
        self.assertFalse(CustomerSettings.objects.filter(user=self.user).exists())

        response = self.client.get(reverse("customer-settings"))

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        data = response.data["data"]
        self.assertTrue(data["show_email"])
        self.assertEqual(data["language"], "en")

    def test_put_updates_privacy_and_preferences(self):
        payload = {
            "show_email": False,
            "show_phone": False,
            "language": "hi",
            "timezone": "UTC",
            "notify_profile_views": True,
        }
        response = self.client.put(reverse("customer-settings"), payload, format="json")

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        data = response.data["data"]
        self.assertFalse(data["show_email"])
        self.assertFalse(data["show_phone"])
        self.assertEqual(data["language"], "hi")
        self.assertTrue(data["notify_profile_views"])
        self.assertTrue(data["show_company"])

    def test_settings_are_isolated_per_user(self):
        self.client.put(reverse("customer-settings"), {"show_email": False}, format="json")

        self.client.force_authenticate(user=self.other_user)
        response = self.client.get(reverse("customer-settings"))

        self.assertTrue(response.data["data"]["show_email"])

    def test_requires_authentication(self):
        self.client.force_authenticate(user=None)
        response = self.client.get(reverse("customer-settings"))
        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)
