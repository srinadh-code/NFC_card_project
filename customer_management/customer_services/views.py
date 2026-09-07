from rest_framework.permissions import IsAuthenticated
from rest_framework.views import APIView

from common.response import error, success

from . import services
from .serializers import CustomerServiceSerializer


class CustomerServiceListCreateView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        items = services.list_services(request.user)
        return success(CustomerServiceSerializer(items, many=True).data)

    def post(self, request):
        serializer = CustomerServiceSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        service = services.create_service(request.user, dict(serializer.validated_data))
        return success(CustomerServiceSerializer(service).data, message="Service added.", status=201)


class CustomerServiceDetailView(APIView):
    permission_classes = [IsAuthenticated]

    def _get_or_404(self, request, pk):
        return services.get_owned_service(request.user, pk)

    def get(self, request, pk):
        service = self._get_or_404(request, pk)
        if service is None:
            return error("Service not found.", status=404)
        return success(CustomerServiceSerializer(service).data)

    def _update(self, request, pk, partial):
        service = self._get_or_404(request, pk)
        if service is None:
            return error("Service not found.", status=404)
        serializer = CustomerServiceSerializer(service, data=request.data, partial=partial)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return success(serializer.data, message="Service updated.")

    def put(self, request, pk):
        return self._update(request, pk, partial=False)

    def patch(self, request, pk):
        return self._update(request, pk, partial=True)

    def delete(self, request, pk):
        service = self._get_or_404(request, pk)
        if service is None:
            return error("Service not found.", status=404)
        service.delete()
        return success(message="Service removed.")


class ReorderCustomerServicesView(APIView):
    permission_classes = [IsAuthenticated]

    def patch(self, request):
        order = request.data.get("order", [])
        services.reorder_services(request.user, order)
        return success(message="Order updated.")
