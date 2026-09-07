import io

from django.urls import reverse
from PIL import Image
from rest_framework import status

from common.test_utils import AuthenticatedAPITestCase
from profiles.models import Profile


def _fake_image_file(name="photo.png"):
    buffer = io.BytesIO()
    Image.new("RGB", (10, 10), color="blue").save(buffer, format="PNG")
    buffer.seek(0)
    buffer.name = name
    return buffer


class CustomerProfileViewTests(AuthenticatedAPITestCase):
    def test_get_creates_profile_on_first_access(self):
        self.assertFalse(Profile.objects.filter(user=self.user).exists())

        response = self.client.get(reverse("customer-profile"))

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertTrue(response.data["success"])
        self.assertTrue(Profile.objects.filter(user=self.user).exists())

    def test_get_requires_authentication(self):
        self.client.force_authenticate(user=None)
        response = self.client.get(reverse("customer-profile"))
        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_put_updates_profile_and_user_fields(self):
        payload = {
            "full_name": "Updated Name",
            "phone": "+919876543210",
            "designation": "Founder",
            "company_name": "Nexora Pvt Ltd",
            "alternate_phone": "+919876500000",
            "bio": "Building digital identities.",
            "address": "123 Main St",
            "city": "Hyderabad",
            "state": "Telangana",
            "country": "India",
        }

        response = self.client.put(reverse("customer-profile"), payload, format="json")

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        data = response.data["data"]
        self.assertEqual(data["full_name"], "Updated Name")
        self.assertEqual(data["company_name"], "Nexora Pvt Ltd")
        self.assertEqual(data["city"], "Hyderabad")

        self.user.refresh_from_db()
        self.assertEqual(self.user.full_name, "Updated Name")
        self.assertEqual(self.user.phone, "+919876543210")

    def test_email_is_read_only(self):
        original_email = self.user.email
        response = self.client.put(
            reverse("customer-profile"), {"email": "hacked@example.com"}, format="json"
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.user.refresh_from_db()
        self.assertEqual(self.user.email, original_email)

    def test_saves_a_valid_google_maps_url(self):
        response = self.client.put(
            reverse("customer-profile"),
            {"google_maps_url": "https://maps.google.com/?q=17.3850,78.4867"},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["data"]["google_maps_url"], "https://maps.google.com/?q=17.3850,78.4867")

        profile = Profile.objects.get(user=self.user)
        self.assertEqual(profile.google_maps_url, "https://maps.google.com/?q=17.3850,78.4867")

    def test_accepts_short_goo_gl_maps_link(self):
        response = self.client.put(
            reverse("customer-profile"), {"google_maps_url": "https://goo.gl/maps/AbCdEfGh"}, format="json"
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)

    def test_rejects_a_url_that_is_not_google_maps(self):
        response = self.client.put(
            reverse("customer-profile"), {"google_maps_url": "https://example.com/not-maps"}, format="json"
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_rejects_a_malformed_url(self):
        response = self.client.put(
            reverse("customer-profile"), {"google_maps_url": "not a url at all"}, format="json"
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_google_maps_url_is_optional(self):
        response = self.client.put(reverse("customer-profile"), {"bio": "hello"}, format="json")
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["data"]["google_maps_url"], "")


class CustomerProfileImageUploadTests(AuthenticatedAPITestCase):
    def test_upload_profile_image(self):
        response = self.client.post(
            reverse("customer-profile-upload-image"),
            {"image": _fake_image_file()},
            format="multipart",
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertIsNotNone(response.data["data"]["profile_image"])

    def test_upload_cover_image(self):
        response = self.client.post(
            reverse("customer-profile-upload-cover"),
            {"image": _fake_image_file("cover.png")},
            format="multipart",
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertIsNotNone(response.data["data"]["cover_image"])

    def test_upload_rejects_non_image_file(self):
        text_file = io.BytesIO(b"not an image")
        text_file.name = "notes.txt"
        response = self.client.post(
            reverse("customer-profile-upload-image"),
            {"image": text_file},
            format="multipart",
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_upload_requires_a_file(self):
        response = self.client.post(
            reverse("customer-profile-upload-image"), {}, format="multipart"
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
