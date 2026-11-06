from rest_framework import serializers

from accounts.models import User
from admin_api.orders.serializers import AdminOrderSerializer


class AdminPurchaserSerializer(serializers.ModelSerializer):
    name = serializers.SerializerMethodField()
    phone = serializers.SerializerMethodField()
    paid_order_count = serializers.IntegerField(read_only=True)
    total_cards_purchased = serializers.IntegerField(read_only=True)
    total_amount_paid = serializers.DecimalField(max_digits=14, decimal_places=2, read_only=True)
    last_purchase_date = serializers.DateTimeField(read_only=True)
    total_cards_assigned = serializers.IntegerField(read_only=True)
    total_cards_activated = serializers.IntegerField(read_only=True)

    class Meta:
        model = User
        fields = ["id", "name", "email", "phone", "paid_order_count", "total_cards_purchased",
                  "total_amount_paid", "last_purchase_date", "total_cards_assigned", "total_cards_activated"]
        read_only_fields = fields


    def get_name(self, obj):
        return getattr(obj, "latest_purchaser_name", "") or obj.full_name

    def get_phone(self, obj):
        return getattr(obj, "latest_purchaser_phone", "") or obj.phone


class AdminPurchaserDetailSerializer(AdminPurchaserSerializer):
    orders = AdminOrderSerializer(source="paid_orders", many=True, read_only=True)

    class Meta(AdminPurchaserSerializer.Meta):
        fields = AdminPurchaserSerializer.Meta.fields + ["orders"]
        read_only_fields = fields
