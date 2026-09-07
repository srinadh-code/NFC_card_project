# Report *data* APIs only (per the brief: reliable data first, CSV/PDF
# generation later if ever needed) — each mirrors one of the frontend's
# four report types, unpaginated since a report is meant to export the
# full matching set, not one page of it.
from django.db.models import Count, Q
from rest_framework.views import APIView

from accounts.models import User
from admin_api.permissions import IsAdminRole
from analytics.models import TapEvent
from common.response import success
from orders.models import Order


class AdminSalesReportView(APIView):
    permission_classes = [IsAdminRole]

    def get(self, request):
        orders = Order.objects.select_related("customer").all()
        rows = [
            {
                "order_id": o.id,
                "customer": o.customer.full_name,
                "amount": o.amount,
                "shipping": o.shipping,
                "total": o.total,
                "payment_status": o.payment_status,
                "order_status": o.status,
                "date": o.placed_at,
            }
            for o in orders
        ]
        return success(rows)


class AdminTapAnalyticsReportView(APIView):
    permission_classes = [IsAdminRole]

    def get(self, request):
        rows = (
            TapEvent.objects.filter(customer__isnull=False)
            .values("customer_id", "customer__full_name")
            .annotate(
                taps=Count("id", filter=Q(action=TapEvent.Action.TAP)),
                qr_scans=Count("id", filter=Q(action=TapEvent.Action.QR_SCAN)),
                profile_views=Count("id", filter=Q(action=TapEvent.Action.PROFILE_VIEW)),
            )
            .order_by("-taps")
        )
        return success(
            [
                {
                    "customer_id": r["customer_id"],
                    "customer_name": r["customer__full_name"],
                    "taps": r["taps"],
                    "qr_scans": r["qr_scans"],
                    "profile_views": r["profile_views"],
                }
                for r in rows
            ]
        )


class AdminCustomerReportView(APIView):
    permission_classes = [IsAdminRole]

    def get(self, request):
        customers = User.objects.filter(role=User.Role.CUSTOMER)
        rows = []
        for c in customers:
            orders = c.orders.exclude(status=Order.Status.CANCELLED)
            taps = c.tap_events.filter(action=TapEvent.Action.TAP).count()
            rows.append(
                {
                    "id": c.id,
                    "name": c.full_name,
                    "email": c.email,
                    "phone": c.phone,
                    "status": "Active" if c.is_active else "Inactive",
                    "total_orders": orders.count(),
                    "total_spent": sum((o.total for o in orders), start=0),
                    "total_taps": taps,
                    "joined_on": c.created_at,
                }
            )
        return success(rows)


class AdminOrderReportView(APIView):
    permission_classes = [IsAdminRole]

    def get(self, request):
        orders = Order.objects.select_related("customer").prefetch_related("items").all()
        rows = [
            {
                "order_id": o.id,
                "customer": o.customer.full_name,
                "items": o.items.count(),
                "total": o.total,
                "status": o.status,
                "payment_method": o.payment_method,
                "date": o.placed_at,
            }
            for o in orders
        ]
        return success(rows)
