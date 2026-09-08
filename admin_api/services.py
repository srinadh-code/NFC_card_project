# Shared aggregation helpers used by both admin_api/dashboard.py and
# admin_api/reports/views.py, so the same "what counts as revenue / an
# active customer / an activated card" rules live in exactly one place
# instead of being redefined per view.
from django.utils import timezone

from accounts.models import User
from nfc_cards.models import NfcCard
from orders.models import Order


def trend_pct(current: float, previous: float) -> float:
    """% change of `current` vs `previous`, matching the frontend's existing
    dashboard trend convention: 0 vs 0 -> 0%, N vs 0 -> 100%."""
    if previous == 0:
        return 100.0 if current > 0 else 0.0
    return ((current - previous) / previous) * 100


def customer_stats() -> dict:
    customers = User.objects.filter(role=User.Role.CUSTOMER)
    return {
        "total": customers.count(),
        "active": customers.filter(is_active=True).count(),
        "inactive": customers.filter(is_active=False).count(),
    }


def card_stats() -> dict:
    cards = NfcCard.objects.all()
    return {
        "total": cards.count(),
        "active": cards.filter(status=NfcCard.Status.ACTIVE).count(),
        "assigned": cards.filter(status=NfcCard.Status.ASSIGNED).count(),
        "unassigned": cards.filter(status=NfcCard.Status.UNASSIGNED).count(),
        "blocked": cards.filter(status=NfcCard.Status.BLOCKED).count(),
        "lost": cards.filter(status=NfcCard.Status.LOST).count(),
    }


def order_stats() -> dict:
    orders = Order.objects.all()
    non_cancelled = orders.exclude(status=Order.Status.CANCELLED)
    revenue = sum((o.total for o in non_cancelled), start=0)
    return {
        "total": orders.count(),
        "pending": orders.filter(status=Order.Status.PENDING).count(),
        "revenue": revenue,
    }


def days_ago(n: int):
    d = timezone.now() - timezone.timedelta(days=n)
    return d
