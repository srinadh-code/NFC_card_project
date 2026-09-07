from datetime import timedelta

from django.utils import timezone

from .models import AnalyticsEvent

RANGE_DAYS = {
    "today": 1,
    "week": 7,
    "month": 30,
    "year": 365,
}


def extract_device(request):
    if request is None:
        return ""
    user_agent = request.META.get("HTTP_USER_AGENT", "").lower()
    if not user_agent:
        return "Unknown"
    if "tablet" in user_agent or "ipad" in user_agent:
        return "Tablet"
    if "mobi" in user_agent or "android" in user_agent or "iphone" in user_agent:
        return "Mobile"
    return "Desktop"


def extract_ip(request):
    if request is None:
        return None
    forwarded_for = request.META.get("HTTP_X_FORWARDED_FOR")
    if forwarded_for:
        return forwarded_for.split(",")[0].strip()
    return request.META.get("REMOTE_ADDR")


def record_event(user, event_type, request=None, source="", metadata=""):
    if user is None:
        return None
    return AnalyticsEvent.objects.create(
        user=user,
        event_type=event_type,
        device=extract_device(request),
        ip_address=extract_ip(request),
        source=source,
        metadata=metadata,
    )


def events_for(user, event_type, since=None):
    queryset = AnalyticsEvent.objects.filter(user=user, event_type=event_type)
    if since is not None:
        queryset = queryset.filter(created_at__gte=since)
    return queryset


def count_since(user, event_type, days):
    since = timezone.now() - timedelta(days=days)
    return events_for(user, event_type, since=since).count()


def period_breakdown(user, event_type):
    return {period: count_since(user, event_type, days) for period, days in RANGE_DAYS.items()}


def summary(user):
    return {
        "profile_views": period_breakdown(user, AnalyticsEvent.EventType.PROFILE_VIEW),
        "nfc_taps": period_breakdown(user, AnalyticsEvent.EventType.NFC_TAP),
        "qr_scans": period_breakdown(user, AnalyticsEvent.EventType.QR_SCAN),
        "social_clicks": period_breakdown(user, AnalyticsEvent.EventType.SOCIAL_CLICK),
        "totals": {
            "profile_views": events_for(user, AnalyticsEvent.EventType.PROFILE_VIEW).count(),
            "nfc_taps": events_for(user, AnalyticsEvent.EventType.NFC_TAP).count(),
            "qr_scans": events_for(user, AnalyticsEvent.EventType.QR_SCAN).count(),
            "social_clicks": events_for(user, AnalyticsEvent.EventType.SOCIAL_CLICK).count(),
        },
    }


def overview(user):
    return {
        "totals": summary(user)["totals"],
        "recent": AnalyticsEvent.objects.filter(user=user)[:10],
    }
