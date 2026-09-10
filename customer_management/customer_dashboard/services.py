from customer_management.customer_analytics.models import AnalyticsEvent
from customer_management.customer_analytics.services import summary as analytics_summary
from customer_management.customer_leads.models import Lead
from customer_management.customer_notifications.models import Notification
from nfc_cards.models import NfcCard
# Not customer_management.customer_orders.Order — that table is no longer
# where checkout writes orders (see config/urls.py's routing comment). The
# live Order model is `orders.Order`, keyed by `customer` not `user`.
from orders.models import Order


def get_dashboard(user):
    totals = analytics_summary(user)["totals"]

    return {
        "totals": {
            "profile_views": totals["profile_views"],
            "nfc_taps": totals["nfc_taps"],
            "qr_scans": totals["qr_scans"],
            "leads": Lead.objects.filter(user=user).count(),
            "orders": Order.objects.filter(customer=user).count(),
        },
        "nfc_cards": NfcCard.objects.filter(user=user),
        "recent_notifications": Notification.objects.filter(user=user)[:5],
        "recent_activity": AnalyticsEvent.objects.filter(user=user)[:10],
    }
