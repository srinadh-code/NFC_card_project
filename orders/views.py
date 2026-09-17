from decimal import Decimal

from django.db import IntegrityError, transaction
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.views import APIView

from common.pagination import StandardPagination
from common.response import error, success

from customer_management.customer_addresses.models import CustomerAddress
from customer_management.customer_cart.services import clear_cart, get_or_create_cart

from .models import Order, OrderItem, Transaction
from .serializers import CustomerOrderCreateSerializer, OrderSerializer, PublicOrderTrackingSerializer
from .services import compose_shipping_snapshot


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
        serializer = CustomerOrderCreateSerializer(data=request.data, context={"request": request})
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

        # Always the authenticated customer's own cart — never a client-
        # supplied items array, and never another customer's cart.
        cart = get_or_create_cart(request.user)
        cart_items = list(cart.items.all())
        if not cart_items:
            return error("Your cart is empty.", status=400)

        amount = sum((item.qty * item.price for item in cart_items), start=Decimal("0"))
        shipping = data.get("shipping") or Decimal("0")
        # Already validated to belong to request.user in
        # CustomerOrderCreateSerializer.validate_address_id.
        address = CustomerAddress.objects.get(pk=data["address_id"])
        shipping_snapshot = compose_shipping_snapshot(address)

        try:
            with transaction.atomic():
                order = Order.objects.create(
                    customer=request.user,
                    idempotency_key=idempotency_key,
                    amount=amount,
                    shipping=shipping,
                    payment_method=data["payment_method"],
                    payment_status=Order.PaymentStatus.PAID,
                    **shipping_snapshot,
                )
                OrderItem.objects.bulk_create(
                    [
                        OrderItem(
                            order=order,
                            product_id=item.product_id,
                            name=item.name,
                            card_type=item.card_type,
                            color=item.color_name,
                            qty=item.qty,
                            price=item.price,
                        )
                        for item in cart_items
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

        # Only this customer's cart — clear_cart is scoped by
        # cart__customer=request.user, never a global clear.
        clear_cart(request.user)
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


class PublicOrderTrackingView(APIView):
    """Unauthenticated order lookup for the public /track-order marketing
    page — a visitor who has (or was given) the order's public
    order_number (e.g. "NXTRK483920", not the internal numeric id) can
    check its shipment status without signing in, the same way a
    courier's own public tracking page works. Returns
    PublicOrderTrackingSerializer's deliberately narrower field set,
    never the full customer/admin shape."""

    permission_classes = [AllowAny]

    def get(self, request, order_number):
        # Case-insensitive: "nxtrk483920" and "NXTRK483920" must resolve to
        # the same order — order_number is always stored upper-case (see
        # Order.generate_order_number), but a visitor may type/paste it in
        # any case.
        order = (
            Order.objects.select_related("customer")
            .prefetch_related("items")
            .filter(order_number__iexact=order_number.strip())
            .first()
        )
        if order is None:
            return error("Order not found.", status=404)
        return success(PublicOrderTrackingSerializer(order).data)
