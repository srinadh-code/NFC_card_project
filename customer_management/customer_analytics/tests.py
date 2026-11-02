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


class PublicTrackingTests(AuthenticatedAPITestCase):
    """QR scans and social clicks recorded by anonymous visitors, counted
    independently and shown on the owner's dashboard."""

    def setUp(self):
        super().setUp()
        self.profile = Profile.ensure_for_user(self.user)
        self.other_profile = Profile.ensure_for_user(self.other_user)
        self.client.force_authenticate(user=None)  # visitors are anonymous

    def _visit(self, username, src=None, ip="203.0.113.5"):
        url = reverse("profile-public", args=[username]) + (f"?src={src}" if src else "")
        return self.client.get(url, REMOTE_ADDR=ip, HTTP_USER_AGENT="Mozilla/5.0 (Linux; Android 14) Mobile")

    def _click(self, username, platform, ip="203.0.113.5"):
        return self.client.post(
            reverse("customer-analytics-track-social-click"),
            {"username": username, "platform": platform},
            REMOTE_ADDR=ip,
        )

    def _count(self, user, event_type):
        return AnalyticsEvent.objects.filter(user=user, event_type=event_type).count()

    def test_direct_visit_is_a_view_not_a_scan(self):
        self._visit(self.profile.username)
        self.assertEqual(self._count(self.user, AnalyticsEvent.EventType.PROFILE_VIEW), 1)
        self.assertEqual(self._count(self.user, AnalyticsEvent.EventType.QR_SCAN), 0)
        self.assertEqual(self._count(self.user, AnalyticsEvent.EventType.NFC_TAP), 0)

    def test_qr_visit_counts_one_scan_for_that_customer_only(self):
        self._visit(self.profile.username, src="qr")
        self.assertEqual(self._count(self.user, AnalyticsEvent.EventType.QR_SCAN), 1)
        self.assertEqual(self._count(self.user, AnalyticsEvent.EventType.NFC_TAP), 0)
        self.assertEqual(self._count(self.other_user, AnalyticsEvent.EventType.QR_SCAN), 0)

    def test_repeated_qr_request_from_same_visitor_counts_once(self):
        self._visit(self.profile.username, src="qr")
        self._visit(self.profile.username, src="qr")
        self.assertEqual(self._count(self.user, AnalyticsEvent.EventType.QR_SCAN), 1)
        # A different visitor scanning at the same time is a separate scan.
        self._visit(self.profile.username, src="qr", ip="198.51.100.7")
        self.assertEqual(self._count(self.user, AnalyticsEvent.EventType.QR_SCAN), 2)

    def test_social_clicks_count_per_click_and_platform(self):
        for platform in ("Instagram", "LinkedIn", "WhatsApp"):
            self.assertEqual(self._click(self.profile.username, platform).status_code, status.HTTP_200_OK)
        clicks = AnalyticsEvent.objects.filter(user=self.user, event_type=AnalyticsEvent.EventType.SOCIAL_CLICK)
        self.assertEqual(sorted(clicks.values_list("metadata", flat=True)), ["Instagram", "LinkedIn", "WhatsApp"])
        # Clicks touch no other counter, and no other customer.
        self.assertEqual(self._count(self.user, AnalyticsEvent.EventType.PROFILE_VIEW), 0)
        self.assertEqual(self._count(self.user, AnalyticsEvent.EventType.QR_SCAN), 0)
        self.assertEqual(self._count(self.other_user, AnalyticsEvent.EventType.SOCIAL_CLICK), 0)

    def test_double_fired_click_counts_once(self):
        self._click(self.profile.username, "Instagram")
        self._click(self.profile.username, "Instagram")
        self.assertEqual(self._count(self.user, AnalyticsEvent.EventType.SOCIAL_CLICK), 1)

    def test_form_encoded_beacon_is_accepted(self):
        """The browser sends clicks with navigator.sendBeacon as form data."""
        response = self.client.post(
            reverse("customer-analytics-track-social-click"),
            f"username={self.profile.username}&platform=LinkedIn",
            content_type="application/x-www-form-urlencoded",
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(self._count(self.user, AnalyticsEvent.EventType.SOCIAL_CLICK), 1)

    def test_clicks_on_private_or_suspended_profiles_are_rejected(self):
        self.profile.profile_public = False
        self.profile.save(update_fields=["profile_public"])
        self.assertEqual(self._click(self.profile.username, "Instagram").status_code, status.HTTP_404_NOT_FOUND)
        self.assertEqual(self._count(self.user, AnalyticsEvent.EventType.SOCIAL_CLICK), 0)

    def test_dashboard_shows_the_owners_counts_only(self):
        self._visit(self.profile.username, src="qr")
        self._click(self.profile.username, "Instagram")
        self._click(self.other_profile.username, "LinkedIn")

        self.client.force_authenticate(user=self.user)
        totals = self.client.get(reverse("customer-analytics-summary")).data["data"]["totals"]
        self.assertEqual(totals["qr_scans"], 1)
        self.assertEqual(totals["social_clicks"], 1)
        self.assertEqual(totals["profile_views"], 1)
