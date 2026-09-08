from rest_framework.views import APIView

from common.permissions import IsCustomerRole
from common.response import success

from . import services
from .serializers import CustomerDashboardSerializer


class CustomerDashboardView(APIView):
    permission_classes = [IsCustomerRole]

    def get(self, request):
        data = services.get_dashboard(request.user)
        return success(CustomerDashboardSerializer(data).data)
