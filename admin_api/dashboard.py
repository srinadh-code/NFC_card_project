# One aggregation view rather than a subpackage — the dashboard has exactly
# one real endpoint (GET /api/admin/dashboard/), so a folder per the other
# modules' convention would be an empty abstraction.
from rest_framework.views import APIView

from accounts.models import User
from admin_api.permissions import IsAdminRole
from common.response import success
from nfc_cards.models import NfcCard
from orders.models import Order

from .services import card_stats, customer_stats, days_ago, order_stats, trend_pct


class AdminDashboardView(APIView):
    permission_classes = [IsAdminRole]

    def get(self, request):
        customers = customer_stats()
        cards = card_stats()
        orders = order_stats()

        cutoff30, cutoff60 = days_ago(30), days_ago(60)

        customers_last30 = User.objects.filter(role=User.Role.CUSTOMER, created_at__gte=cutoff30).count()
        customers_prev30 = User.objects.filter(
            role=User.Role.CUSTOMER, created_at__gte=cutoff60, created_at__lt=cutoff30
        ).count()

        orders_last30 = Order.objects.filter(placed_at__gte=cutoff30).count()
        orders_prev30 = Order.objects.filter(placed_at__gte=cutoff60, placed_at__lt=cutoff30).count()

        non_cancelled = Order.objects.exclude(status=Order.Status.CANCELLED)
        revenue_last30 = sum((o.total for o in non_cancelled.filter(placed_at__gte=cutoff30)), start=0)
        revenue_prev30 = sum(
            (o.total for o in non_cancelled.filter(placed_at__gte=cutoff60, placed_at__lt=cutoff30)), start=0
        )

        cards_last30 = NfcCard.objects.filter(activated_on__gte=cutoff30).count()
        cards_prev30 = NfcCard.objects.filter(activated_on__gte=cutoff60, activated_on__lt=cutoff30).count()

        today = days_ago(0).date()
        todays_orders = non_cancelled.filter(placed_at__date=today)
        todays_revenue = sum((o.total for o in todays_orders), start=0)

        recent_orders = Order.objects.select_related("customer").all()[:6]

        data = {
            "total_customers": customers["total"],
            "active_customers": customers["active"],
            "total_cards": cards["total"],
            "activated_cards": cards["active"],
            "total_orders": orders["total"],
            "pending_orders": orders["pending"],
            "total_revenue": orders["revenue"],
            "todays_revenue": todays_revenue,
            "customer_trend": trend_pct(customers_last30, customers_prev30),
            "order_trend": trend_pct(orders_last30, orders_prev30),
            "revenue_trend": trend_pct(float(revenue_last30), float(revenue_prev30)),
            "card_trend": trend_pct(cards_last30, cards_prev30),
            "recent_orders": [
                {
                    "id": o.id,
                    "customer_name": o.customer.full_name,
                    "total": o.total,
                    "status": o.status,
                    "date": o.placed_at,
                }
                for o in recent_orders
            ],
        }
        return success(data)
