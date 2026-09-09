from rest_framework.views import APIView

from common.permissions import IsCustomerRole
from common.response import success
from common.views import PaginatedAPIView

from . import services
from .serializers import MarkNotificationsReadSerializer, NotificationSerializer


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
