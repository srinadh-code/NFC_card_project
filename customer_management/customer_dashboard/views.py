from rest_framework.permissions import IsAuthenticated
from rest_framework.views import APIView

from common.response import success

from . import services
from .serializers import CustomerDashboardSerializer


class CustomerDashboardView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        data = services.get_dashboard(request.user)
        return success(CustomerDashboardSerializer(data).data)
