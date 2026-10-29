from rest_framework.permissions import AllowAny
from rest_framework.views import APIView

from common.permissions import IsCustomerRole
from common.response import error, success
from common.views import PaginatedAPIView

from . import services
from .serializers import MarkNotificationsReadSerializer, NotificationSerializer, PublicAnnouncementSerializer


class CustomerNotificationsView(PaginatedAPIView):
    permission_classes = [IsCustomerRole]

    def get(self, request):
        unread_only = request.query_params.get("unread_only") == "true"
        notifications = services.list_notifications(request.user, unread_only=unread_only)
        return self.paginate(notifications, NotificationSerializer)


class MarkNotificationsReadView(APIView):
    permission_classes = [IsCustomerRole]

    def post(self, request):
        serializer = MarkNotificationsReadSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        updated = services.mark_read(
            request.user,
            ids=serializer.validated_data["ids"],
            mark_all=serializer.validated_data["all"],
        )
        return success({"updated": updated}, message="Notifications marked as read.")


class NotificationDetailView(APIView):
    """Deleting a notification is a separate action from reading one — see
    services.delete_notification. Never touches the event that created it
    (the Order, NfcCard, Announcement, etc. are untouched)."""

    permission_classes = [IsCustomerRole]

    def delete(self, request, pk):
        deleted = services.delete_notification(request.user, pk)
        if not deleted:
            # Covers "never existed", "already deleted", and "belongs to
            # another customer" identically — same as CustomerOrderDetailView
            # — so a request can never probe which case it hit.
            return error("Notification not found.", status=404)
        return success(message="Notification deleted.")


class DeleteReadNotificationsView(APIView):
    permission_classes = [IsCustomerRole]

    def delete(self, request):
        deleted = services.delete_read_notifications(request.user)
        return success({"deleted": deleted}, message="Read notifications cleared.")


class PublicAnnouncementListView(APIView):
    """Unauthenticated — the public marketing site's offer/announcement
    banners. Only ever returns announcements that are published, targeted
    at the Public Website (or Both), and currently within their start/end
    window (see services.list_active_public_announcements) — an admin
    draft, a customer-only announcement, or an expired offer never reaches
    this response."""

    permission_classes = [AllowAny]

    def get(self, request):
        announcements = services.list_active_public_announcements()
        return success(PublicAnnouncementSerializer(announcements, many=True).data)
