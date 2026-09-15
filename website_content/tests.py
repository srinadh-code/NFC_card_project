from unittest.mock import patch

from django.urls import reverse
from rest_framework import status
from rest_framework.test import APITestCase

from common.test_utils import make_user

from .models import FeaturesPageCard, FeaturesPageSettings, GeneralSettings, Statistic


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


class FeaturesPagePublicViewTests(APITestCase):
    """The composed public payload the Features page fetches in one call —
    migration 0010 seeds a real page/cards/analytics/cta/statistics row set,
    so these run against that same seeded content rather than fixtures."""

    def test_returns_seeded_content_with_no_auth(self):
        response = self.client.get(reverse("public-features-page"))

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        data = response.data["data"]
        self.assertIsNotNone(data["page"])
        self.assertEqual(data["page"]["hero_heading_line1"], "More Than a Card.")
        self.assertGreaterEqual(len(data["cards"]), 6)
        self.assertIsNotNone(data["analytics"])
        self.assertIsNotNone(data["cta"])
        # Statistics are scoped to this page only — never Home's/About's rows.
        self.assertTrue(all(s["page"] == "features" for s in data["statistics"]))

    def test_hides_inactive_card(self):
        card = FeaturesPageCard.objects.create(
            title="Draft Card", description="Not ready yet", icon="Zap", is_active=False
        )
        response = self.client.get(reverse("public-features-page"))
        ids = [c["id"] for c in response.data["data"]["cards"]]
        self.assertNotIn(card.id, ids)

    def test_404_when_page_settings_missing(self):
        FeaturesPageSettings.objects.all().delete()
        response = self.client.get(reverse("public-features-page"))
        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)


class FeaturesPageCardAdminViewTests(APITestCase):
    """Full CRUD + reorder + the Cloudinary-cleanup-on-delete contract for
    the Features page's own card collection."""

    def setUp(self):
        super().setUp()
        self.admin = make_user(email="features-admin@example.com", role="ADMIN")
        self.customer = make_user(email="features-customer@example.com")

    def test_requires_admin_role(self):
        self.client.force_authenticate(user=self.customer)
        response = self.client.get(reverse("admin-features-cards"))
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_admin_can_create_update_and_delete_a_card(self):
        self.client.force_authenticate(user=self.admin)

        create = self.client.post(
            reverse("admin-features-cards"),
            {"title": "Bulk Discounts", "description": "Save on multi-card orders.", "icon": "Tag"},
            format="json",
        )
        self.assertEqual(create.status_code, status.HTTP_201_CREATED)
        card_id = create.data["data"]["id"]

        update = self.client.patch(
            reverse("admin-features-card-detail", args=[card_id]),
            {"title": "Bulk Pricing"},
            format="json",
        )
        self.assertEqual(update.status_code, status.HTTP_200_OK)
        self.assertEqual(update.data["data"]["title"], "Bulk Pricing")

        delete = self.client.delete(reverse("admin-features-card-detail", args=[card_id]))
        self.assertEqual(delete.status_code, status.HTTP_200_OK)
        self.assertFalse(FeaturesPageCard.objects.filter(pk=card_id).exists())

    def test_deleting_a_card_cleans_up_its_cloudinary_asset(self):
        self.client.force_authenticate(user=self.admin)
        card = FeaturesPageCard.objects.create(
            title="With Image",
            description="...",
            icon="Zap",
            image_url="https://res.cloudinary.com/demo/image/upload/v1/website/features/abc123.png",
            image_public_id="website/features/abc123",
        )

        with patch("website_content.views.base.delete_image") as mock_delete:
            response = self.client.delete(reverse("admin-features-card-detail", args=[card.id]))

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        mock_delete.assert_called_once_with("website/features/abc123")

    def test_deleting_a_card_with_no_image_does_not_call_cloudinary(self):
        self.client.force_authenticate(user=self.admin)
        card = FeaturesPageCard.objects.create(title="No Image", description="...", icon="Zap")

        with patch("website_content.views.base.delete_image") as mock_delete:
            self.client.delete(reverse("admin-features-card-detail", args=[card.id]))

        mock_delete.assert_not_called()

    def test_reorder(self):
        self.client.force_authenticate(user=self.admin)
        a = FeaturesPageCard.objects.create(title="A", description="", icon="Zap", display_order=0)
        b = FeaturesPageCard.objects.create(title="B", description="", icon="Zap", display_order=1)

        response = self.client.patch(
            reverse("admin-features-cards-reorder"), {"order": [b.id, a.id]}, format="json"
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        a.refresh_from_db()
        b.refresh_from_db()
        self.assertEqual(b.display_order, 0)
        self.assertEqual(a.display_order, 1)


class FeaturesPageSettingsAdminViewTests(APITestCase):
    def setUp(self):
        super().setUp()
        self.admin = make_user(email="features-settings-admin@example.com", role="ADMIN")

    def test_admin_can_update_hero_copy(self):
        self.client.force_authenticate(user=self.admin)
        response = self.client.patch(
            reverse("admin-features-page"),
            {"hero_heading_line1": "Updated Heading", "trusted_users_count": "25,000+"},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["data"]["hero_heading_line1"], "Updated Heading")

        # Reflected immediately on the public composed payload — no cache to bust.
        public = self.client.get(reverse("public-features-page"))
        self.assertEqual(public.data["data"]["page"]["trusted_users_count"], "25,000+")


class FeaturesStatisticsTests(APITestCase):
    """Statistics reuse the shared Statistic model with page="features" —
    confirms that filter actually isolates this page's rows from Home/About."""

    def test_admin_list_filters_to_features_page(self):
        admin = make_user(email="stats-admin@example.com", role="ADMIN")
        self.client.force_authenticate(user=admin)
        Statistic.objects.create(page="home", value="1", label="Home Stat")

        response = self.client.get(reverse("admin-statistics"), {"page": "features"})

        labels = [s["label"] for s in response.data["data"]]
        self.assertNotIn("Home Stat", labels)
        self.assertTrue(all(s["page"] == "features" for s in response.data["data"]))
