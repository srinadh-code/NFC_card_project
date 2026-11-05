from decimal import Decimal

from django.db import transaction
from django.db.models import Q
from rest_framework.views import APIView

from accounts import onboarding
from accounts.models import User
from admin_api.permissions import IsAdminRole
from common.pagination import StandardPagination
from common.response import error, success
from nfc_cards.models import NfcCard
from orders.models import Order, OrderItem, Transaction

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
        qs = Order.objects.select_related("customer", "checkout_session").prefetch_related("items", "recipients").all()

        search = request.query_params.get("search", "").strip()
        if search:
            search_filter = (
                Q(customer__full_name__icontains=search)
                | Q(customer__email__icontains=search)
                | Q(order_number__icontains=search)
            )
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
        order = (
            Order.objects.select_related("customer", "customer__onboarding", "checkout_session")
            .prefetch_related("items", "recipients")
            .filter(pk=pk)
            .first()
        )
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
        new_status = serializer.validated_data["status"]
        previous_status = order.status

        # Processing starts fulfilment and the customer's account activation,
        # so the order must really be paid: Paid status *and* a successful
        # payment record.
        if new_status == Order.Status.PROCESSING and previous_status != Order.Status.PROCESSING:
            paid = order.payment_status == Order.PaymentStatus.PAID and Transaction.objects.filter(
                order=order, status=Order.PaymentStatus.PAID
            ).exists()
            if not paid:
                return error(
                    "This order has no successful payment yet, so it can't move to Processing.",
                    errors={"code": "payment_required"},
                    status=400,
                )

        activation = None
        try:
            with transaction.atomic():
                apply_status_transition(order, new_status)
                # Only on the move into Processing — re-saving Processing (or any
                # other status) never sends the activation email again, and
                # start_activation_for_order itself sends at most once per account.
                if new_status == Order.Status.PROCESSING and previous_status != Order.Status.PROCESSING:
                    activation = onboarding.start_activation_for_order(order)
        except ValueError as exc:
            return error(str(exc), status=400)

        message = {
            "sent": "Order is Processing. The account activation email is being sent to the customer.",
            "already_sent": "Order is Processing. This customer's activation email was already sent earlier.",
            "active": "Order is Processing. The customer already has an active account.",
            "partial_failure": "Order is Processing. Activation started for some recipients; check each recipient's status and retry any failures.",
            "failed": "Order is Processing, but activation could not be started for the recipients. Check their status and retry.",
        }.get(activation, "Order status updated.")
        order.refresh_from_db()
        return success({**AdminOrderSerializer(order).data, "activation_result": activation}, message=message)


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
