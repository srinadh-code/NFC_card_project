from django.db.models import Q
from rest_framework.views import APIView

from admin_api.permissions import IsAdminRole
from common.pagination import StandardPagination
from common.response import error, success
from orders.models import Order, Transaction

from .serializers import AdminTransactionSerializer, AdminTransactionWriteSerializer


class AdminTransactionListCreateView(APIView):
    permission_classes = [IsAdminRole]

    def get(self, request):
        qs = Transaction.objects.select_related("order", "order__customer").all()

        search = request.query_params.get("search", "").strip()
        if search:
            search_filter = Q(order__customer__full_name__icontains=search) | Q(
                order__customer__email__icontains=search
            )
            if search.isdigit():
                search_filter |= Q(id=int(search)) | Q(order_id=int(search))
            qs = qs.filter(search_filter)

        method_param = request.query_params.get("method", "").strip().upper()
        if method_param and method_param in Order.PaymentMethod.values:
            qs = qs.filter(method=method_param)

        status_param = request.query_params.get("status", "").strip().upper()
        if status_param and status_param in Order.PaymentStatus.values:
            qs = qs.filter(status=status_param)

        paginator = StandardPagination()
        page = paginator.paginate_queryset(qs, request)
        return paginator.get_paginated_response(AdminTransactionSerializer(page, many=True).data)

    def post(self, request):
        serializer = AdminTransactionWriteSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data

        order = Order.objects.get(pk=data["order_id"])
        txn = Transaction.objects.create(
            order=order, amount=data["amount"], method=data["method"], status=data["status"]
        )
        return success(AdminTransactionSerializer(txn).data, message="Transaction recorded.", status=201)


class AdminTransactionDetailView(APIView):
    permission_classes = [IsAdminRole]

    def get(self, request, pk):
        txn = Transaction.objects.select_related("order", "order__customer").filter(pk=pk).first()
        if txn is None:
            return error("Transaction not found.", status=404)
        return success(AdminTransactionSerializer(txn).data)
