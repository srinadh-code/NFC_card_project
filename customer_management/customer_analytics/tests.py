from django.urls import reverse
from rest_framework import status

from common.test_utils import AuthenticatedAPITestCase
from profiles.models import Profile

from .models import AnalyticsEvent
from .services import record_event


class CustomerAnalyticsSummaryTests(AuthenticatedAPITestCase):
    def test_summary_counts_by_type_and_period(self):
        record_event(self.user, AnalyticsEvent.EventType.PROFILE_VIEW)
        record_event(self.user, AnalyticsEvent.EventType.PROFILE_VIEW)
        record_event(self.user, AnalyticsEvent.EventType.NFC_TAP)
        record_event(self.other_user, AnalyticsEvent.EventType.PROFILE_VIEW)

        response = self.client.get(reverse("customer-analytics-summary"))

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        data = response.data["data"]
        self.assertEqual(data["totals"]["profile_views"], 2)
        self.assertEqual(data["totals"]["nfc_taps"], 1)
        self.assertEqual(data["profile_views"]["today"], 2)

    def test_requires_authentication(self):
        self.client.force_authenticate(user=None)
        response = self.client.get(reverse("customer-analytics-summary"))
        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)


class CustomerAnalyticsOverviewTests(AuthenticatedAPITestCase):
    def test_overview_returns_totals_and_recent_events(self):
        record_event(self.user, AnalyticsEvent.EventType.QR_SCAN)

        response = self.client.get(reverse("customer-analytics-overview"))

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["data"]["totals"]["qr_scans"], 1)
        self.assertEqual(len(response.data["data"]["recent"]), 1)


class CustomerAnalyticsListEndpointTests(AuthenticatedAPITestCase):
    def test_views_endpoint_only_returns_profile_views_for_current_user(self):
        record_event(self.user, AnalyticsEvent.EventType.PROFILE_VIEW)
        record_event(self.user, AnalyticsEvent.EventType.NFC_TAP)
        record_event(self.other_user, AnalyticsEvent.EventType.PROFILE_VIEW)

        response = self.client.get(reverse("customer-analytics-views"))

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(len(response.data["data"]), 1)
        self.assertEqual(response.data["data"][0]["event_type"], "PROFILE_VIEW")
        self.assertIn("pagination", response.data)

    def test_taps_endpoint(self):
        record_event(self.user, AnalyticsEvent.EventType.NFC_TAP, source="nfc")
        response = self.client.get(reverse("customer-analytics-taps"))
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(len(response.data["data"]), 1)

    def test_scans_endpoint(self):
        record_event(self.user, AnalyticsEvent.EventType.QR_SCAN, source="qr")
        response = self.client.get(reverse("customer-analytics-scans"))
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(len(response.data["data"]), 1)


class TrackSocialClickViewTests(AuthenticatedAPITestCase):
    def test_anonymous_visitor_can_record_a_click(self):
        profile = Profile.ensure_for_user(self.user)
        self.client.force_authenticate(user=None)

        response = self.client.post(
            reverse("customer-analytics-track-social-click"),
            {"username": profile.username, "platform": "LinkedIn"},
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(
            AnalyticsEvent.objects.filter(
                user=self.user, event_type=AnalyticsEvent.EventType.SOCIAL_CLICK
            ).count(),
            1,
        )

    def test_unknown_username_returns_404(self):
        self.client.force_authenticate(user=None)
        response = self.client.post(
            reverse("customer-analytics-track-social-click"),
            {"username": "does-not-exist", "platform": "LinkedIn"},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)

    def test_rejects_unknown_platform(self):
        profile = Profile.ensure_for_user(self.user)
        self.client.force_authenticate(user=None)
        response = self.client.post(
            reverse("customer-analytics-track-social-click"),
            {"username": profile.username, "platform": "MySpace"},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
