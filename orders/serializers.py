from rest_framework import serializers

from nfc_cards.models import NfcCard

from .models import Order, OrderItem

TRACKING_LABELS = ["Order Placed", "Order Confirmed", "Shipped", "Out for Delivery", "Delivered"]
STEP_FIELDS = ["placed_at", "confirmed_at", "shipped_at", "out_for_delivery_at", "delivered_at"]


class OrderItemSerializer(serializers.ModelSerializer):
    class Meta:
        model = OrderItem
        fields = ["product_id", "name", "card_type", "color", "qty", "price"]
        read_only_fields = fields


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
        cancelled = obj.status == Order.Status.CANCELLED
        steps = []
        for i, (field, label) in enumerate(zip(STEP_FIELDS, TRACKING_LABELS)):
            if cancelled:
                done = i == 0
                date = obj.placed_at if done else None
            else:
                date = getattr(obj, field)
                done = date is not None
            steps.append({"label": label, "date": date, "done": done})
        return steps


class OrderItemInputSerializer(serializers.Serializer):
    product_id = serializers.CharField(max_length=40)
    name = serializers.CharField(max_length=150)
    card_type = serializers.ChoiceField(choices=NfcCard.CardType.choices)
    color = serializers.CharField(max_length=30)
    qty = serializers.IntegerField(min_value=1)
    price = serializers.DecimalField(max_digits=10, decimal_places=2, min_value=0)


class CustomerOrderCreateSerializer(serializers.Serializer):
    """Self-service checkout — the customer places and owns this order
    directly (unlike AdminOrderCreateSerializer, which is an admin entering
    an offline order on someone else's behalf). No payment gateway is wired
    up yet, so the resulting order is stamped PAID immediately, matching
    what the checkout page already assumed before this endpoint existed."""

    # Generated client-side once per checkout attempt and resent unchanged
    # on every retry of that same attempt (double-click, network retry) —
    # lets the view recognize and no-op a duplicate instead of creating a
    # second order. Optional so existing callers (none currently omit it,
    # but the admin-created-order path is a separate serializer entirely)
    # aren't forced to supply one.
    idempotency_key = serializers.CharField(max_length=64, required=False, allow_blank=True, default="")
    items = OrderItemInputSerializer(many=True)
    shipping = serializers.DecimalField(max_digits=10, decimal_places=2, required=False, default=0)
    payment_method = serializers.ChoiceField(choices=Order.PaymentMethod.choices)
    shipping_line1 = serializers.CharField(max_length=255)
    shipping_city = serializers.CharField(max_length=100)
    # The checkout form has no "State" field (only Address Line, City,
    # Pincode) — it always sends "". Blank/optional here rather than adding
    # a form field, since the UI is intentionally not being changed.
    shipping_state = serializers.CharField(max_length=100, required=False, allow_blank=True, default="")
    shipping_pincode = serializers.CharField(max_length=12)
    shipping_country = serializers.CharField(max_length=100, required=False, default="India")

    def validate_items(self, value):
        if not value:
            raise serializers.ValidationError("At least one item is required.")
        return value
