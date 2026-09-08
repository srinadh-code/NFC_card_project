from decimal import Decimal

from django.db import IntegrityError, transaction
from rest_framework.permissions import IsAuthenticated
from rest_framework.views import APIView

from common.pagination import StandardPagination
from common.response import error, success

from .models import Order, OrderItem, Transaction
from .serializers import CustomerOrderCreateSerializer, OrderSerializer


class CustomerOrderListCreateView(APIView):
    """A customer's own orders — the counterpart to admin_api.orders, which
    lists/creates orders across all customers. This is the endpoint the
    public checkout flow posts to, and the one the customer's Orders page
    reads from, so both sides of an order agree with what admin sees."""

    permission_classes = [IsAuthenticated]

    def get(self, request):
        qs = Order.objects.select_related("customer").prefetch_related("items").filter(customer=request.user)
        paginator = StandardPagination()
        page = paginator.paginate_queryset(qs, request)
        return paginator.get_paginated_response(OrderSerializer(page, many=True).data)

    def post(self, request):
        serializer = CustomerOrderCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data

        # Empty string (the serializer default) means "no key supplied" —
        # normalize to None so it lines up with the model's NULL-means-none
        # convention instead of colliding with other keyless orders under
        # the unique constraint.
        idempotency_key = data["idempotency_key"].strip() or None

        if idempotency_key is not None:
            existing = Order.objects.filter(customer=request.user, idempotency_key=idempotency_key).first()
            if existing is not None:
                # Same submission attempt replayed (double-click, retry) —
                # hand back the order that already exists instead of
                # creating a second one.
                return success(OrderSerializer(existing).data, message="Order placed.", status=200)

        amount = sum((item["qty"] * item["price"] for item in data["items"]), start=Decimal("0"))
        shipping = data.get("shipping") or Decimal("0")

        try:
            with transaction.atomic():
                order = Order.objects.create(
                    customer=request.user,
                    idempotency_key=idempotency_key,
                    amount=amount,
                    shipping=shipping,
                    payment_method=data["payment_method"],
                    payment_status=Order.PaymentStatus.PAID,
                    shipping_line1=data["shipping_line1"],
                    shipping_city=data["shipping_city"],
                    shipping_state=data["shipping_state"],
                    shipping_pincode=data["shipping_pincode"],
                    shipping_country=data.get("shipping_country") or "India",
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
                Transaction.objects.create(
                    order=order,
                    amount=amount + shipping,
                    method=data["payment_method"],
                    status=Order.PaymentStatus.PAID,
                )
        except IntegrityError:
            # Lost a race against another request carrying the exact same
            # key (two near-simultaneous submissions of the same attempt) —
            # the database's unique constraint is the actual guard here;
            # this just returns whichever order won instead of erroring.
            existing = Order.objects.get(customer=request.user, idempotency_key=idempotency_key)
            return success(OrderSerializer(existing).data, message="Order placed.", status=200)

        order.refresh_from_db()
        return success(OrderSerializer(order).data, message="Order placed.", status=201)


class CustomerOrderDetailView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, pk):
        order = (
            Order.objects.select_related("customer")
            .prefetch_related("items")
            .filter(pk=pk, customer=request.user)
            .first()
        )
        if order is None:
            return error("Order not found.", status=404)
        return success(OrderSerializer(order).data)
