from rest_framework import serializers

from accounts.models import User
from nfc_cards.models import NfcCard
from orders.models import Order, OrderItem

from .services import STEP_FIELDS

TRACKING_LABELS = ["Order Placed", "Order Confirmed", "Shipped", "Out for Delivery", "Delivered"]


class OrderItemSerializer(serializers.ModelSerializer):
    class Meta:
        model = OrderItem
        fields = ["product_id", "name", "card_type", "color", "qty", "price"]
        read_only_fields = fields


class AdminOrderSerializer(serializers.ModelSerializer):
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


class OrderItemWriteSerializer(serializers.Serializer):
    product_id = serializers.CharField(max_length=40)
    name = serializers.CharField(max_length=150)
    card_type = serializers.ChoiceField(choices=NfcCard.CardType.choices)
    color = serializers.CharField(max_length=30)
    qty = serializers.IntegerField(min_value=1)
    price = serializers.DecimalField(max_digits=10, decimal_places=2, min_value=0)


class AdminOrderCreateSerializer(serializers.Serializer):
    """Manual/offline order entry — real orders otherwise only exist once a
    public checkout flow is built (see the reports on remaining
    dependencies). Not tied to a payment gateway; `payment_status` is set
    directly by the admin."""

    customer_email = serializers.EmailField()
    items = OrderItemWriteSerializer(many=True)
    shipping = serializers.DecimalField(max_digits=10, decimal_places=2, required=False, default=0)
    payment_method = serializers.ChoiceField(choices=Order.PaymentMethod.choices)
    payment_status = serializers.ChoiceField(
        choices=Order.PaymentStatus.choices, required=False, default=Order.PaymentStatus.PENDING
    )
    shipping_line1 = serializers.CharField(max_length=255)
    shipping_city = serializers.CharField(max_length=100)
    shipping_state = serializers.CharField(max_length=100)
    shipping_pincode = serializers.CharField(max_length=12)
    shipping_country = serializers.CharField(max_length=100, required=False, default="India")

    def validate_customer_email(self, value):
        value = value.strip().lower()
        customer = User.objects.filter(email=value, role=User.Role.CUSTOMER).first()
        if customer is None:
            raise serializers.ValidationError("No customer account found with that email.")
        return value

    def validate_items(self, value):
        if not value:
            raise serializers.ValidationError("At least one item is required.")
        return value


class AdminOrderStatusSerializer(serializers.Serializer):
    status = serializers.ChoiceField(choices=Order.Status.choices)


class AdminOrderAssignCardSerializer(serializers.Serializer):
    card_id = serializers.IntegerField()
