from rest_framework import serializers

from orders.models import Order, Transaction


class AdminTransactionSerializer(serializers.ModelSerializer):
    order_id = serializers.IntegerField(read_only=True)
    customer_id = serializers.IntegerField(source="order.customer_id", read_only=True)
    customer_name = serializers.CharField(source="order.customer.full_name", read_only=True)

    class Meta:
        model = Transaction
        fields = ["id", "order_id", "customer_id", "customer_name", "amount", "method", "status", "created_at"]
        read_only_fields = fields


class AdminTransactionWriteSerializer(serializers.Serializer):
    """Manual reconciliation entry — no payment gateway is wired up yet, so
    these rows record what an admin observed happened (COD collected, bank
    transfer confirmed, refund issued...)."""

    order_id = serializers.IntegerField()
    amount = serializers.DecimalField(max_digits=10, decimal_places=2, min_value=0)
    method = serializers.ChoiceField(choices=Order.PaymentMethod.choices)
    status = serializers.ChoiceField(choices=Order.PaymentStatus.choices)

    def validate_order_id(self, value):
        if not Order.objects.filter(pk=value).exists():
            raise serializers.ValidationError("No order found with that id.")
        return value
