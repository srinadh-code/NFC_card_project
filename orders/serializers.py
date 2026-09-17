from rest_framework import serializers

from nfc_cards.models import NfcCard

from .models import Order, OrderItem

TRACKING_LABELS = ["Order Placed", "Order Confirmed", "Shipped", "Out for Delivery", "Delivered"]
STEP_FIELDS = ["placed_at", "confirmed_at", "shipped_at", "out_for_delivery_at", "delivered_at"]

# Google Review Card is a separate public-site product, not an NFC business
# card — it isn't part of nfc_cards.NfcCard.CardType (which models the
# physical business-card inventory admin manages/assigns), so it's added
# here as an order-item-only card type instead of touching that enum.
# OrderItem.card_type is a plain CharField with no model-level choices (see
# orders.models.OrderItem), so this only affects what new order items this
# serializer accepts.
GOOGLE_REVIEW_CARD_TYPE = "REVIEW"

ORDER_ITEM_CARD_TYPE_CHOICES = [*NfcCard.CardType.choices, (GOOGLE_REVIEW_CARD_TYPE, "Google Review Card")]


class OrderItemSerializer(serializers.ModelSerializer):
    class Meta:
        model = OrderItem
        fields = ["product_id", "name", "card_type", "color", "qty", "price"]
        read_only_fields = fields


def compute_tracking(order):
    """The single source of truth for an order's step-by-step tracking
    timeline — shared by OrderSerializer (customer/admin) and
    PublicOrderTrackingSerializer (the unauthenticated /track-order page)
    so both ever read from the same real columns, never a second
    parallel status system."""
    cancelled = order.status == Order.Status.CANCELLED
    steps = []
    for i, (field, label) in enumerate(zip(STEP_FIELDS, TRACKING_LABELS)):
        if cancelled:
            done = i == 0
            date = order.placed_at if done else None
        else:
            date = getattr(order, field)
            done = date is not None
        steps.append({"label": label, "date": date, "done": done})
    return steps


class OrderSerializer(serializers.ModelSerializer):
    """Canonical order representation for the customer who owns it — same
    shape admin_api.orders.AdminOrderSerializer exposes to admins, since a
    customer's own order carries nothing they shouldn't already see."""

    customer_id = serializers.IntegerField(read_only=True)
    customer_name = serializers.CharField(source="customer.full_name", read_only=True)
    customer_email = serializers.EmailField(source="customer.email", read_only=True)
    customer_phone = serializers.CharField(source="customer.phone", read_only=True)
    items = OrderItemSerializer(many=True, read_only=True)
    total = serializers.DecimalField(max_digits=10, decimal_places=2, read_only=True)
    address = serializers.SerializerMethodField()
    tracking = serializers.SerializerMethodField()
    assigned_card_id = serializers.IntegerField(read_only=True)

    class Meta:
        model = Order
        fields = [
            "id",
            "order_number",
            "customer_id",
            "customer_name",
            "customer_email",
            "customer_phone",
            "items",
            "amount",
            "shipping",
            "total",
            "payment_method",
            "payment_status",
            "status",
            "address",
            "tracking",
            "assigned_card_id",
            "placed_at",
        ]
        read_only_fields = fields

    def get_address(self, obj):
        return {
            "line1": obj.shipping_line1,
            "city": obj.shipping_city,
            "state": obj.shipping_state,
            "pincode": obj.shipping_pincode,
            "country": obj.shipping_country,
        }

    def get_tracking(self, obj):
        return compute_tracking(obj)


def mask_customer_name(full_name):
    """First name + last-initial ("Kavya Jampala" -> "Kavya J.") — enough
    for the actual customer to recognize their own order on the fully
    public, unauthenticated tracking page, without handing a stranger who
    only guessed/knows the numeric Order ID a complete real name."""
    name = (full_name or "").strip()
    if not name:
        return "Customer"
    parts = name.split()
    if len(parts) == 1:
        return parts[0]
    return f"{parts[0]} {parts[-1][0]}."


class PublicOrderTrackingSerializer(serializers.ModelSerializer):
    """Safe, public-facing order representation for the unauthenticated
    /track-order page — deliberately a much smaller field set than
    OrderSerializer: no email, phone, exact street address, payment
    method, or internal card-assignment id. Just enough for a visitor who
    supplies a real Order ID to confirm it's theirs and see its shipment
    progress."""

    customer_name = serializers.SerializerMethodField()
    items = OrderItemSerializer(many=True, read_only=True)
    total = serializers.DecimalField(max_digits=10, decimal_places=2, read_only=True)
    address = serializers.SerializerMethodField()
    tracking = serializers.SerializerMethodField()

    class Meta:
        model = Order
        # Deliberately no "id" here — the internal numeric primary key is
        # never surfaced on the public tracking page, only order_number
        # (see Order.generate_order_number in models.py). Also no
        # payment_method/assigned_card_id, unlike OrderSerializer.
        fields = [
            "order_number",
            "customer_name",
            "items",
            "amount",
            "shipping",
            "total",
            "payment_status",
            "status",
            "address",
            "tracking",
            "placed_at",
        ]
        read_only_fields = fields

    def get_customer_name(self, obj):
        return mask_customer_name(obj.customer.full_name)

    def get_address(self, obj):
        # City/state/pincode only — never the exact street line, since
        # this endpoint requires no proof of ownership beyond the Order ID.
        return {
            "city": obj.shipping_city,
            "state": obj.shipping_state,
            "pincode": obj.shipping_pincode,
            "country": obj.shipping_country,
        }

    def get_tracking(self, obj):
        return compute_tracking(obj)


class CustomerOrderCreateSerializer(serializers.Serializer):
    """Self-service checkout — the customer places and owns this order
    directly (unlike AdminOrderCreateSerializer, which is an admin entering
    an offline order on someone else's behalf). No payment gateway is wired
    up yet, so the resulting order is stamped PAID immediately, matching
    what the checkout page already assumed before this endpoint existed.

    Deliberately takes NO `items` field — the client used to send its own
    cart lines directly, which meant trusting whatever product/price a
    request claimed. Order items are now built by the view from the
    customer's own server-side cart (customer_management.customer_cart),
    which is itself always looked up by request.user, never a client-
    supplied id — see CustomerOrderListCreateView.post.

    `address_id` selects one of the customer's own saved
    customer_addresses.CustomerAddress rows — its fields are copied (never
    live-referenced) into the new Order's shipping_* columns at creation
    time by the view (see orders.services.compose_shipping_snapshot),
    exactly once.
    """

    # Generated client-side once per checkout attempt and resent unchanged
    # on every retry of that same attempt (double-click, network retry) —
    # lets the view recognize and no-op a duplicate instead of creating a
    # second order. Optional so existing callers (none currently omit it,
    # but the admin-created-order path is a separate serializer entirely)
    # aren't forced to supply one.
    idempotency_key = serializers.CharField(max_length=64, required=False, allow_blank=True, default="")
    shipping = serializers.DecimalField(max_digits=10, decimal_places=2, required=False, default=0)
    payment_method = serializers.ChoiceField(choices=Order.PaymentMethod.choices)
    address_id = serializers.IntegerField()

    def validate_address_id(self, value):
        from customer_management.customer_addresses.models import CustomerAddress

        request = self.context.get("request")
        owner = getattr(request, "user", None)
        if not CustomerAddress.objects.filter(pk=value, customer=owner).exists():
            raise serializers.ValidationError("Please select a valid delivery address.")
        return value
