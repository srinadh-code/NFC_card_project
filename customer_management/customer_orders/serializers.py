from decimal import Decimal

from rest_framework import serializers

from nfc_cards.models import NfcCard

from .models import Order, OrderItem, OrderStatusHistory


class OrderItemInputSerializer(serializers.Serializer):
    card_type = serializers.ChoiceField(choices=NfcCard.CardType.choices)
    color = serializers.CharField(max_length=30, default="Black")
    quantity = serializers.IntegerField(min_value=1, default=1)
    unit_price = serializers.DecimalField(max_digits=10, decimal_places=2, min_value=Decimal("0.01"))


class OrderItemSerializer(serializers.ModelSerializer):
    class Meta:
        model = OrderItem
        fields = ["id", "card_type", "color", "quantity", "unit_price", "line_total"]
        read_only_fields = fields


class OrderStatusHistorySerializer(serializers.ModelSerializer):
    class Meta:
        model = OrderStatusHistory
        fields = ["status", "note", "created_at"]
        read_only_fields = fields


class OrderSerializer(serializers.ModelSerializer):
    items = OrderItemSerializer(many=True, read_only=True)
    status_history = OrderStatusHistorySerializer(many=True, read_only=True)

    class Meta:
        model = Order
        fields = [
            "id",
            "order_number",
            "status",
            "shipping_full_name",
            "shipping_phone",
            "shipping_address",
            "shipping_city",
            "shipping_state",
            "shipping_country",
            "shipping_postal_code",
            "subtotal",
            "discount",
            "total",
            "tracking_number",
            "notes",
            "items",
            "status_history",
            "created_at",
            "updated_at",
        ]
        read_only_fields = fields


class CreateOrderSerializer(serializers.Serializer):
    shipping_full_name = serializers.CharField(max_length=150)
    shipping_phone = serializers.CharField(max_length=20)
    shipping_address = serializers.CharField()
    shipping_city = serializers.CharField(max_length=100)
    shipping_state = serializers.CharField(max_length=100)
    shipping_country = serializers.CharField(max_length=100)
    shipping_postal_code = serializers.CharField(max_length=20)
    notes = serializers.CharField(required=False, allow_blank=True, default="")
    discount = serializers.DecimalField(
        max_digits=10, decimal_places=2, min_value=Decimal("0"), required=False, default=Decimal("0")
    )
    items = OrderItemInputSerializer(many=True, allow_empty=False)

    def validate(self, attrs):
        subtotal = sum(
            (item["unit_price"] * item["quantity"] for item in attrs["items"]), Decimal("0")
        )
        if attrs["discount"] > subtotal:
            raise serializers.ValidationError({"discount": "Discount cannot exceed the order subtotal."})
        return attrs
