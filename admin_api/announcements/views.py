from rest_framework.views import APIView

from admin_api.permissions import IsAdminRole
from common.pagination import StandardPagination
from common.response import success
from customer_management.customer_notifications.models import Announcement
from customer_management.customer_notifications.serializers import (
    AnnouncementCreateSerializer,
    AnnouncementSerializer,
)
from customer_management.customer_notifications.services import create_announcement


class AdminAnnouncementListCreateView(APIView):
    """System Messages: the one admin-facing surface that creates them.
    GET lists what's already been sent (audit trail); POST sends a new one,
    fanning out to every customer's Notification feed via the same notify()
    every other notification type uses (still gated per-customer by
    notify_system_messages — see services.create_announcement)."""

    permission_classes = [IsAdminRole]

    def get(self, request):
        qs = Announcement.objects.select_related("created_by").all()
        paginator = StandardPagination()
        page = paginator.paginate_queryset(qs, request)
        return paginator.get_paginated_response(AnnouncementSerializer(page, many=True).data)

    def post(self, request):
        serializer = AnnouncementCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        announcement = create_announcement(
            created_by=request.user,
            title=serializer.validated_data["title"],
            message=serializer.validated_data.get("message", ""),
        )
        return success(
            AnnouncementSerializer(announcement).data, message="Announcement sent.", status=201
        )
