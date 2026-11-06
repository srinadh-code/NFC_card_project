from django.db.models import Prefetch, Q
from rest_framework.views import APIView

from admin_api.permissions import IsAdminRole
from common.pagination import StandardPagination
from common.response import error, success
from orders.models import Order, OrderRecipient

from .serializers import AdminPurchaserDetailSerializer, AdminPurchaserSerializer


def purchaser_queryset():
    # One paid parent order per row. Prefetch items and allocations separately
    # so joins cannot multiply quantities or mix recipients from other orders.
    recipients = OrderRecipient.objects.select_related("user__onboarding", "profile", "assigned_card")
    return (
        Order.objects.filter(payment_status=Order.PaymentStatus.PAID)
        .select_related("customer__onboarding", "checkout_session", "assigned_card")
        .prefetch_related("items", Prefetch("recipients", queryset=recipients))
        .order_by("-placed_at", "-pk")
    )


class AdminPurchaserListView(APIView):
    permission_classes = [IsAdminRole]

    def get(self, request):
        qs = purchaser_queryset()
        search = request.query_params.get("search", "").strip()
        if search:
            match = Q(purchaser_name__icontains=search) | Q(purchaser_email__icontains=search) | Q(purchaser_phone__icontains=search) | Q(order_number__icontains=search)
            if search.isascii() and search.isdecimal():
                match |= Q(pk=search)
            qs = qs.filter(match)
        paginator = StandardPagination()
        page = paginator.paginate_queryset(qs, request)
        return paginator.get_paginated_response(AdminPurchaserSerializer(page, many=True).data)


class AdminPurchaserDetailView(APIView):
    permission_classes = [IsAdminRole]

    def get(self, request, pk):
        order = purchaser_queryset().filter(pk=pk).first()
        if order is None:
            return error("Paid purchase not found.", status=404)
        return success(AdminPurchaserDetailSerializer(order).data)
