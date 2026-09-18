from django.conf import settings
from django.urls import reverse
from rest_framework import status

from common.test_utils import AuthenticatedAPITestCase
from profiles.models import Profile

from .models import CustomerQrCode


class CustomerQrCodeViewTests(AuthenticatedAPITestCase):
    def test_get_returns_404_before_generation(self):
        response = self.client.get(reverse("customer-qr"))
        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)

    def test_generate_creates_a_qr_code(self):
        response = self.client.post(reverse("customer-qr-generate"))

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(CustomerQrCode.objects.count(), 1)
        self.assertIsNotNone(response.data["data"]["image"])
        profile = Profile.objects.get(user=self.user)
        self.assertIn(profile.username, response.data["data"]["target_url"])

    def test_target_url_points_at_the_frontend_not_the_api_request_host(self):
        """Regression test: target_url must be built from settings.FRONTEND_URL,
        never from request.build_absolute_uri() — that bug encoded the
        Django API host (e.g. http://localhost:8000) into the QR code
        instead of the React app's own origin, which has no /u/<username>
        route at all and 404s when scanned."""
        response = self.client.post(reverse("customer-qr-generate"))

        target_url = response.data["data"]["target_url"]
        profile = Profile.objects.get(user=self.user)

        self.assertTrue(target_url.startswith(settings.FRONTEND_URL))
        self.assertEqual(target_url, f"{settings.FRONTEND_URL}/u/{profile.username}?src=qr")
        self.assertNotIn("testserver", target_url)

    def test_generate_is_idempotent(self):
        self.client.post(reverse("customer-qr-generate"))
        response = self.client.post(reverse("customer-qr-generate"))

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(CustomerQrCode.objects.count(), 1)

    def test_regenerate_replaces_the_image(self):
        self.client.post(reverse("customer-qr-generate"))
        original = CustomerQrCode.objects.get()
        original_image_name = original.image.name

        response = self.client.post(reverse("customer-qr-regenerate"))

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(CustomerQrCode.objects.count(), 1)
        refreshed = CustomerQrCode.objects.get()
        self.assertNotEqual(refreshed.image.name, original_image_name)

    def test_requires_authentication(self):
        self.client.force_authenticate(user=None)
        response = self.client.get(reverse("customer-qr"))
        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)
