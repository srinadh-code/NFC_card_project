from rest_framework.views import APIView

from common.permissions import IsCustomerRole
from common.response import success

from .models import CustomerSettings
from .serializers import CustomerSettingsSerializer


class CustomerSettingsView(APIView):
    permission_classes = [IsCustomerRole]

    def get(self, request):
        settings_obj = CustomerSettings.ensure_for_user(request.user)
        return success(CustomerSettingsSerializer(settings_obj).data)

    def put(self, request):
        settings_obj = CustomerSettings.ensure_for_user(request.user)
        serializer = CustomerSettingsSerializer(settings_obj, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return success(serializer.data, message="Settings updated.")
