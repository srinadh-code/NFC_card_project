from decimal import Decimal

from django.db import transaction
from django.db.models import Q
from rest_framework.views import APIView

from accounts.models import User
from admin_api.permissions import IsAdminRole
from common.pagination import StandardPagination
from common.response import error, success
from nfc_cards.models import NfcCard
from orders.models import Order, OrderItem

from .serializers import (
    AdminOrderAssignCardSerializer,
    AdminOrderCreateSerializer,
    AdminOrderSerializer,
    AdminOrderStatusSerializer,
)
from .services import assign_card_to_order, apply_status_transition


class AdminOrderListCreateView(APIView):
    permission_classes = [IsAdminRole]

    def get(self, request):
        qs = Order.objects.select_related("customer").prefetch_related("items").all()

        search = request.query_params.get("search", "").strip()
        if search:
            search_filter = Q(customer__full_name__icontains=search) | Q(customer__email__icontains=search)
            if search.isdigit():
                search_filter |= Q(id=int(search))
            qs = qs.filter(search_filter)

        status_param = request.query_params.get("status", "").strip().upper()
        if status_param and status_param in Order.Status.values:
            qs = qs.filter(status=status_param)

        paginator = StandardPagination()
        page = paginator.paginate_queryset(qs, request)
        return paginator.get_paginated_response(AdminOrderSerializer(page, many=True).data)

    def post(self, request):
        serializer = AdminOrderCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data

        customer = User.objects.get(email=data["customer_email"], role=User.Role.CUSTOMER)
        amount = sum((item["qty"] * item["price"] for item in data["items"]), start=Decimal("0"))

        with transaction.atomic():
            order = Order.objects.create(
                customer=customer,
                amount=amount,
                shipping=data.get("shipping", 0),
                payment_method=data["payment_method"],
                payment_status=data.get("payment_status", Order.PaymentStatus.PENDING),
                shipping_line1=data["shipping_line1"],
                shipping_city=data["shipping_city"],
                shipping_state=data["shipping_state"],
                shipping_pincode=data["shipping_pincode"],
                shipping_country=data.get("shipping_country", "India"),
            )
            OrderItem.objects.bulk_create(
                [
                    OrderItem(
                        order=order,
                        product_id=item["product_id"],
                        name=item["name"],
                        card_type=item["card_type"],
                        color=item["color"],
                        qty=item["qty"],
                        price=item["price"],
                    )
                    for item in data["items"]
                ]
            )

        order.refresh_from_db()
        return success(AdminOrderSerializer(order).data, message="Order created.", status=201)


class AdminOrderDetailView(APIView):
    permission_classes = [IsAdminRole]

    def get(self, request, pk):
        order = Order.objects.select_related("customer").prefetch_related("items").filter(pk=pk).first()
        if order is None:
            return error("Order not found.", status=404)
        return success(AdminOrderSerializer(order).data)


class AdminOrderStatusView(APIView):
    permission_classes = [IsAdminRole]

    def post(self, request, pk):
        order = Order.objects.filter(pk=pk).first()
        if order is None:
            return error("Order not found.", status=404)

        serializer = AdminOrderStatusSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        try:
            apply_status_transition(order, serializer.validated_data["status"])
        except ValueError as exc:
            return error(str(exc), status=400)

        return success(AdminOrderSerializer(order).data, message="Order status updated.")


class AdminOrderAssignCardView(APIView):
    permission_classes = [IsAdminRole]

    def post(self, request, pk):
        order = Order.objects.select_related("customer").filter(pk=pk).first()
        if order is None:
            return error("Order not found.", status=404)

        serializer = AdminOrderAssignCardSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        card = NfcCard.objects.filter(pk=serializer.validated_data["card_id"]).first()
        if card is None:
            return error("Card not found.", status=404)

        try:
            assign_card_to_order(order, card)
        except ValueError as exc:
            return error(str(exc), status=400)

        return success(AdminOrderSerializer(order).data, message="Card assigned to order.")
