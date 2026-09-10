from django.urls import reverse
from rest_framework import status

from common.test_utils import AuthenticatedAPITestCase
from customer_management.customer_analytics.models import AnalyticsEvent
from customer_management.customer_analytics.services import record_event
from customer_management.customer_leads.models import Lead
from customer_management.customer_notifications.models import Notification
from nfc_cards.models import NfcCard
from orders.models import Order


class CustomerDashboardViewTests(AuthenticatedAPITestCase):
    def test_aggregates_totals_from_every_module(self):
        record_event(self.user, AnalyticsEvent.EventType.PROFILE_VIEW)
        record_event(self.user, AnalyticsEvent.EventType.NFC_TAP)
        record_event(self.user, AnalyticsEvent.EventType.QR_SCAN)
        Lead.objects.create(user=self.user, name="Lead One", email="lead@example.com")

        Order.objects.create(
            customer=self.user,
            amount=100,
            payment_method=Order.PaymentMethod.COD,
            shipping_line1="Addr",
            shipping_city="City",
            shipping_state="State",
            shipping_pincode="000000",
        )
        NfcCard.objects.create(
            uid="04AABBCC0099",
            serial_number=NfcCard.generate_serial_number(),
            status=NfcCard.Status.ACTIVE,
            user=self.user,
        )
        Notification.objects.create(user=self.user, title="Welcome")

        # Noise from another user — must never leak into these totals.
        record_event(self.other_user, AnalyticsEvent.EventType.PROFILE_VIEW)

        response = self.client.get(reverse("customer-dashboard"))

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        data = response.data["data"]
        self.assertEqual(data["totals"]["profile_views"], 1)
        self.assertEqual(data["totals"]["nfc_taps"], 1)
        self.assertEqual(data["totals"]["qr_scans"], 1)
        self.assertEqual(data["totals"]["leads"], 1)
        self.assertEqual(data["totals"]["orders"], 1)
        self.assertEqual(len(data["nfc_cards"]), 1)
        self.assertGreaterEqual(len(data["recent_notifications"]), 1)
        self.assertGreaterEqual(len(data["recent_activity"]), 3)

    def test_requires_authentication(self):
        self.client.force_authenticate(user=None)
        response = self.client.get(reverse("customer-dashboard"))
        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)
