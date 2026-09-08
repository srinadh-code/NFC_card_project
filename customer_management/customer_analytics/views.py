from django.shortcuts import get_object_or_404
from rest_framework.permissions import AllowAny
from rest_framework.views import APIView

from common.permissions import IsCustomerRole
from common.response import success
from common.views import PaginatedAPIView
from profiles.models import Profile

from . import services
from .models import AnalyticsEvent
from .serializers import AnalyticsEventSerializer, TrackSocialClickSerializer


class CustomerAnalyticsOverviewView(APIView):
    """GET /api/customer/analytics/ — quick totals + most recent activity."""

    permission_classes = [IsCustomerRole]

    def get(self, request):
        data = services.overview(request.user)
        data["recent"] = AnalyticsEventSerializer(data["recent"], many=True).data
        return success(data)


class CustomerAnalyticsSummaryView(APIView):
    """GET /api/customer/analytics/summary/ — today/week/month/year rollups per event type."""

    permission_classes = [IsCustomerRole]

    def get(self, request):
        return success(services.summary(request.user))


class CustomerAnalyticsViewsView(PaginatedAPIView):
    permission_classes = [IsCustomerRole]

    def get(self, request):
        queryset = services.events_for(request.user, AnalyticsEvent.EventType.PROFILE_VIEW)
        return self.paginate(queryset, AnalyticsEventSerializer)


class CustomerAnalyticsTapsView(PaginatedAPIView):
    permission_classes = [IsCustomerRole]

    def get(self, request):
        queryset = services.events_for(request.user, AnalyticsEvent.EventType.NFC_TAP)
        return self.paginate(queryset, AnalyticsEventSerializer)


class CustomerAnalyticsScansView(PaginatedAPIView):
    permission_classes = [IsCustomerRole]

    def get(self, request):
        queryset = services.events_for(request.user, AnalyticsEvent.EventType.QR_SCAN)
        return self.paginate(queryset, AnalyticsEventSerializer)


class TrackSocialClickView(APIView):
    """
    POST /api/customer/analytics/track/social-click/ — public beacon a
    visitor's browser calls when they click a link on someone's public
    profile page. Not authenticated: the click happens on someone else's
    profile, by a visitor who has no account.
    """

    permission_classes = [AllowAny]

    def post(self, request):
        serializer = TrackSocialClickSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        profile = get_object_or_404(
            Profile, username__iexact=serializer.validated_data["username"]
        )
        services.record_event(
            profile.user,
            AnalyticsEvent.EventType.SOCIAL_CLICK,
            request=request,
            source="public_profile",
            metadata=serializer.validated_data["platform"],
        )
        return success(message="Recorded.")
