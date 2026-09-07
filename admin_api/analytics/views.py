from django.db.models import Count
from django.db.models.functions import TruncDate
from django.utils import timezone
from rest_framework.views import APIView

from admin_api.permissions import IsAdminRole
from analytics.models import TapEvent
from common.response import success

from .serializers import AnalyticsSummarySerializer


class AdminAnalyticsSummaryView(APIView):
    """Real aggregates only. `top_locations` is always empty today — no
    GeoIP service is integrated, so TapEvent.location is never populated;
    see the accompanying report for this remaining dependency rather than
    a fabricated city list."""

    permission_classes = [IsAdminRole]

    def get(self, request):
        try:
            range_days = int(request.query_params.get("range", 30))
        except ValueError:
            range_days = 30
        cutoff = timezone.now() - timezone.timedelta(days=range_days)

        qs = TapEvent.objects.filter(created_at__gte=cutoff)
        customer_id = request.query_params.get("customer_id")
        if customer_id:
            qs = qs.filter(customer_id=customer_id)

        by_action = dict(qs.values("action").annotate(n=Count("id")).values_list("action", "n"))
        by_day = list(
            qs.annotate(day=TruncDate("created_at"))
            .values("day")
            .annotate(n=Count("id"))
            .order_by("day")
        )
        by_device = list(qs.values("device").annotate(n=Count("id")).order_by("-n"))
        unique_visitors = qs.values("visitor_hash").distinct().count()
        locations = list(
            qs.exclude(location__isnull=True)
            .values("location")
            .annotate(n=Count("id"))
            .order_by("-n")[:8]
        )

        data = {
            "range_days": range_days,
            "total_taps": by_action.get(TapEvent.Action.TAP, 0),
            "qr_scans": by_action.get(TapEvent.Action.QR_SCAN, 0),
            "profile_views": by_action.get(TapEvent.Action.PROFILE_VIEW, 0),
            "contact_saves": by_action.get(TapEvent.Action.CONTACT_SAVED, 0),
            "shares": by_action.get(TapEvent.Action.SHARED, 0),
            "unique_visitors": unique_visitors,
            "by_day": [{"date": row["day"].isoformat(), "count": row["n"]} for row in by_day],
            "by_device": [{"device": row["device"], "count": row["n"]} for row in by_device],
            "top_locations": [{"location": row["location"], "count": row["n"]} for row in locations],
        }
        return success(AnalyticsSummarySerializer(data).data)
