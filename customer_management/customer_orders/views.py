from rest_framework.permissions import IsAuthenticated
from rest_framework.views import APIView

from common.response import error, success
from common.views import PaginatedAPIView

from . import services
from .serializers import CreateOrderSerializer, OrderSerializer


class CustomerOrderListCreateView(PaginatedAPIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        orders = services.list_orders(request.user)
        return self.paginate(orders, OrderSerializer)

    def post(self, request):
        serializer = CreateOrderSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        order = services.create_order(request.user, dict(serializer.validated_data))
        return success(OrderSerializer(order).data, message="Order placed.", status=201)


class CustomerOrderDetailView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, pk):
        order = services.get_order(request.user, pk)
        if order is None:
            return error("Order not found.", status=404)
        return success(OrderSerializer(order).data)
