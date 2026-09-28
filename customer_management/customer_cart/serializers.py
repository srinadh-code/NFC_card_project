from rest_framework import serializers

from .models import Cart, CartItem


class CartItemSerializer(serializers.ModelSerializer):
    class Meta:
        model = CartItem
        fields = ["id", "product_id", "name", "card_type", "color_name", "color_hex", "qty", "price", "updated_at"]
        read_only_fields = ["id", "updated_at"]


class CartSerializer(serializers.ModelSerializer):
    """Always the requesting customer's own cart — see views.py, which
    never constructs this from anything but Cart.objects.get_or_create(
    customer=request.user)."""

    items = CartItemSerializer(many=True, read_only=True)

    class Meta:
        model = Cart
        fields = ["id", "items", "updated_at"]
        read_only_fields = fields


class AddCartItemSerializer(serializers.Serializer):
    product_id = serializers.CharField(max_length=40)
    name = serializers.CharField(max_length=150)
    card_type = serializers.CharField(max_length=10)
    color_name = serializers.CharField(max_length=30)
    color_hex = serializers.CharField(max_length=10, required=False, allow_blank=True, default="")
    qty = serializers.IntegerField(min_value=1, default=1)
    price = serializers.DecimalField(max_digits=10, decimal_places=2, min_value=0)


class UpdateCartItemSerializer(serializers.Serializer):
    qty = serializers.IntegerField(min_value=1)
