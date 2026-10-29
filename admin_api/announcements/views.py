
from rest_framework.views import APIView
from admin_api.permissions import IsAdminRole
from common.pagination import StandardPagination
from common.response import error, success
from customer_management.customer_notifications import services
from customer_management.customer_notifications.models import Announcement
from customer_management.customer_notifications.serializers import (
    AnnouncementSerializer,
    AnnouncementWriteSerializer,
)
class AdminAnnouncementListCreateView(APIView):
    """GET lists every announcement ever created (the "Previously Sent"
    audit trail — draft, scheduled, published and expired alike); POST
    creates one as either a draft or published (see
    AnnouncementWriteSerializer's is_published field) — publishing at
    creation time fans it out immediately via services.create_announcement,
    exactly like the original "send now" System Message behaviour."""

    permission_classes = [IsAdminRole]

    def get(self, request):
        qs = services.list_announcements()

        announcement_type = request.query_params.get("type", "").strip().upper()
        if announcement_type and announcement_type in Announcement.AnnouncementType.values:
            qs = qs.filter(announcement_type=announcement_type)

        display_location = request.query_params.get("display_location", "").strip().upper()
        if display_location and display_location in Announcement.DisplayLocation.values:
            qs = qs.filter(display_location=display_location)

        paginator = StandardPagination()
        page = paginator.paginate_queryset(qs, request)
        return paginator.get_paginated_response(AnnouncementSerializer(page, many=True).data)

    def post(self, request):
        serializer = AnnouncementWriteSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        announcement = services.create_announcement(request.user, serializer.validated_data)
        return success(
            AnnouncementSerializer(announcement).data, message="Announcement created.", status=201
        )


class AdminAnnouncementDetailView(APIView):
    permission_classes = [IsAdminRole]

    def get_object(self, pk):
        return Announcement.objects.filter(pk=pk).first()

    def get(self, request, pk):
        announcement = self.get_object(pk)
        if announcement is None:
            return error("Announcement not found.", status=404)
        return success(AnnouncementSerializer(announcement).data)

    def patch(self, request, pk):
        announcement = self.get_object(pk)
        if announcement is None:
            return error("Announcement not found.", status=404)
        serializer = AnnouncementWriteSerializer(announcement, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        announcement = services.update_announcement(announcement, serializer.validated_data)
        return success(AnnouncementSerializer(announcement).data, message="Announcement updated.")

    def delete(self, request, pk):
        announcement = self.get_object(pk)
        if announcement is None:
            return error("Announcement not found.", status=404)
        services.delete_announcement(announcement)
        return success(message="Announcement deleted.")


class AdminAnnouncementPublishView(APIView):
    permission_classes = [IsAdminRole]

    def post(self, request, pk):
        announcement = Announcement.objects.filter(pk=pk).first()
        if announcement is None:
            return error("Announcement not found.", status=404)
        announcement = services.set_published(announcement, True)
        return success(AnnouncementSerializer(announcement).data, message="Announcement published.")


class AdminAnnouncementUnpublishView(APIView):
    permission_classes = [IsAdminRole]

    def post(self, request, pk):
        announcement = Announcement.objects.filter(pk=pk).first()
        if announcement is None:
            return error("Announcement not found.", status=404)
        announcement = services.set_published(announcement, False)
        return success(AnnouncementSerializer(announcement).data, message="Announcement unpublished.")
