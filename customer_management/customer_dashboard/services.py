from customer_management.customer_analytics.models import AnalyticsEvent
from customer_management.customer_analytics.services import summary as analytics_summary
from customer_management.customer_leads.models import Lead
from customer_management.customer_notifications.models import Notification
from customer_management.customer_orders.models import Order
from nfc_cards.models import NfcCard


def get_dashboard(user):
    totals = analytics_summary(user)["totals"]

    return {
        "totals": {
            "profile_views": totals["profile_views"],
            "nfc_taps": totals["nfc_taps"],
            "qr_scans": totals["qr_scans"],
            "leads": Lead.objects.filter(user=user).count(),
            "orders": Order.objects.filter(user=user).count(),
        },
        "nfc_cards": NfcCard.objects.filter(user=user),
        "recent_notifications": Notification.objects.filter(user=user)[:5],
        "recent_activity": AnalyticsEvent.objects.filter(user=user)[:10],
    }
