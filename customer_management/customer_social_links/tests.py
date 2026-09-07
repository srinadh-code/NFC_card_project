from django.urls import reverse
from rest_framework import status

from common.test_utils import AuthenticatedAPITestCase
from profiles.models import Profile, SocialLink


class CustomerSocialLinksViewTests(AuthenticatedAPITestCase):
    def test_get_returns_default_platform_rows(self):
        response = self.client.get(reverse("customer-social-links"))
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        platforms = {item["platform"] for item in response.data["data"]}
        self.assertIn("LinkedIn", platforms)
        self.assertIn("Instagram", platforms)

    def test_get_requires_authentication(self):
        self.client.force_authenticate(user=None)
        response = self.client.get(reverse("customer-social-links"))
        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_put_updates_and_enables_links(self):
        payload = {
            "links": [
                {"platform": "LinkedIn", "url": "https://linkedin.com/in/test", "enabled": True},
                {"platform": "GitHub", "url": "https://github.com/test", "enabled": True},
            ]
        }
        response = self.client.put(reverse("customer-social-links"), payload, format="json")
        self.assertEqual(response.status_code, status.HTTP_200_OK)

        profile = Profile.objects.get(user=self.user)
        linkedin = profile.social_links.get(platform="LinkedIn")
        self.assertEqual(linkedin.url, "https://linkedin.com/in/test")
        self.assertTrue(linkedin.enabled)

    def test_put_rejects_invalid_url(self):
        payload = {"links": [{"platform": "Website", "url": "not-a-url"}]}
        response = self.client.put(reverse("customer-social-links"), payload, format="json")
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_put_rejects_duplicate_platform_in_payload(self):
        payload = {
            "links": [
                {"platform": "LinkedIn", "url": "https://linkedin.com/in/a"},
                {"platform": "LinkedIn", "url": "https://linkedin.com/in/b"},
            ]
        }
        response = self.client.put(reverse("customer-social-links"), payload, format="json")
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_put_rejects_unknown_platform(self):
        payload = {"links": [{"platform": "MySpace", "url": "https://myspace.com/test"}]}
        response = self.client.put(reverse("customer-social-links"), payload, format="json")
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_links_are_isolated_per_user(self):
        self.client.put(
            reverse("customer-social-links"),
            {"links": [{"platform": "Twitter", "url": "https://twitter.com/me"}]},
            format="json",
        )
        other_profile = Profile.ensure_for_user(self.other_user)
        self.assertFalse(
            SocialLink.objects.filter(profile=other_profile, platform="Twitter", url="https://twitter.com/me").exists()
        )
