import io

from django.core.files.uploadedfile import SimpleUploadedFile
from django.urls import reverse
from PIL import Image
from rest_framework import status
from rest_framework.test import APITestCase

from common.test_utils import make_user
from customer_management.customer_analytics.models import AnalyticsEvent
from customer_management.customer_services.models import CustomerService

from .models import Profile


def _fake_image_file(name="cover.png"):
    buffer = io.BytesIO()
    Image.new("RGB", (10, 10), color="blue").save(buffer, format="PNG")
    buffer.seek(0)
    return SimpleUploadedFile(name, buffer.read(), content_type="image/png")


class PublicProfileViewTests(APITestCase):
    def setUp(self):
        self.user = make_user(email="public@example.com", full_name="Public Person")
        self.profile = Profile.ensure_for_user(self.user)

    def test_returns_404_for_unknown_username(self):
        response = self.client.get(reverse("profile-public", args=["nobody"]))
        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)

    def test_returns_404_for_private_profile(self):
        self.profile.profile_public = False
        self.profile.save(update_fields=["profile_public"])

        response = self.client.get(reverse("profile-public", args=[self.profile.username]))
        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)

    def test_visiting_a_public_profile_records_a_profile_view(self):
        response = self.client.get(reverse("profile-public", args=[self.profile.username]))

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(
            AnalyticsEvent.objects.filter(
                user=self.user, event_type=AnalyticsEvent.EventType.PROFILE_VIEW
            ).count(),
            1,
        )

    def test_visiting_via_qr_also_records_a_qr_scan(self):
        url = reverse("profile-public", args=[self.profile.username]) + "?src=qr"
        response = self.client.get(url)

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(
            AnalyticsEvent.objects.filter(
                user=self.user, event_type=AnalyticsEvent.EventType.QR_SCAN
            ).count(),
            1,
        )
        self.assertEqual(
            AnalyticsEvent.objects.filter(
                user=self.user, event_type=AnalyticsEvent.EventType.PROFILE_VIEW
            ).count(),
            1,
        )

    def test_email_hidden_unless_owner_opted_in(self):
        self.profile.show_contact_info = False
        self.profile.save(update_fields=["show_contact_info"])

        response = self.client.get(reverse("profile-public", args=[self.profile.username]))

        self.assertIsNone(response.data["data"]["email"])

    def test_cover_image_and_avatar_are_absolute_urls(self):
        """
        Regression test: the public serializer must build absolute media
        URLs using the request context — returning a bare relative path
        (e.g. "/media/...") breaks the image everywhere the API base host
        differs from the frontend host, which is the reported bug.
        """
        self.profile.avatar = _fake_image_file("avatar.png")
        self.profile.cover_image = _fake_image_file("cover.png")
        self.profile.save()

        response = self.client.get(reverse("profile-public", args=[self.profile.username]))

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        data = response.data["data"]
        self.assertTrue(data["avatar"].startswith("http"))
        self.assertTrue(data["cover_image"].startswith("http"))

    def test_cover_image_is_null_when_not_set(self):
        response = self.client.get(reverse("profile-public", args=[self.profile.username]))
        self.assertIsNone(response.data["data"]["cover_image"])

    def test_city_state_country_are_public(self):
        self.profile.city = "Hyderabad"
        self.profile.state = "Telangana"
        self.profile.country = "India"
        self.profile.save(update_fields=["city", "state", "country"])

        response = self.client.get(reverse("profile-public", args=[self.profile.username]))

        data = response.data["data"]
        self.assertEqual(data["city"], "Hyderabad")
        self.assertEqual(data["state"], "Telangana")
        self.assertEqual(data["country"], "India")

    def test_only_active_services_are_public(self):
        CustomerService.objects.create(user=self.user, title="Web Dev", display_order=0, is_active=True)
        CustomerService.objects.create(user=self.user, title="Hidden", display_order=1, is_active=False)

        response = self.client.get(reverse("profile-public", args=[self.profile.username]))

        titles = [s["title"] for s in response.data["data"]["services"]]
        self.assertEqual(titles, ["Web Dev"])

    def test_google_maps_url_is_public(self):
        self.profile.google_maps_url = "https://maps.google.com/?q=17.3850,78.4867"
        self.profile.save(update_fields=["google_maps_url"])

        response = self.client.get(reverse("profile-public", args=[self.profile.username]))

        self.assertEqual(response.data["data"]["google_maps_url"], "https://maps.google.com/?q=17.3850,78.4867")

    def test_services_are_scoped_to_the_profile_owner(self):
        other = make_user(email="other-service-owner@example.com")
        CustomerService.objects.create(user=other, title="Someone else's service")

        response = self.client.get(reverse("profile-public", args=[self.profile.username]))

        self.assertEqual(response.data["data"]["services"], [])
