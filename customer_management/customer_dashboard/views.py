from rest_framework.views import APIView

from common.permissions import IsRecipientCustomer
from common.response import success

from . import services
from .serializers import CustomerDashboardSerializer


class CustomerDashboardView(APIView):
    permission_classes = [IsRecipientCustomer]

    def get(self, request):
        data = services.get_dashboard(request.user)
        return success(CustomerDashboardSerializer(data).data)
