from rest_framework import serializers

from admin_api.orders.serializers import AdminOrderSerializer
from orders.models import Order


class AdminPurchaserSerializer(serializers.ModelSerializer):
    # Blank historical snapshots stay blank; today's account contacts are
    # not evidence of the purchaser details used on an older order.
    name = serializers.CharField(source="purchaser_name", read_only=True)
    email = serializers.CharField(source="purchaser_email", read_only=True)
    phone = serializers.CharField(source="purchaser_phone", read_only=True)
    total_cards_purchased = serializers.SerializerMethodField()
    total_amount_paid = serializers.DecimalField(source="total", max_digits=14, decimal_places=2, read_only=True)
    purchase_date = serializers.DateTimeField(source="placed_at", read_only=True)
    total_cards_assigned = serializers.SerializerMethodField()
    total_cards_activated = serializers.SerializerMethodField()

    class Meta:
        model = Order
        fields = ["id", "order_number", "customer_id", "name", "email", "phone", "total_cards_purchased",
                  "total_amount_paid", "purchase_date", "total_cards_assigned", "total_cards_activated"]
        read_only_fields = fields


    def get_total_cards_purchased(self, obj):
        return sum(item.qty for item in obj.items.all())

    def _assigned_cards(self, obj):
        recipients = list(obj.recipients.all())
        if recipients:
            return list({r.assigned_card_id: r.assigned_card for r in recipients if r.assigned_card_id}.values())
        # Preserve physical card history for orders predating allocations.
        return [obj.assigned_card] if obj.assigned_card_id else []

    def get_total_cards_assigned(self, obj):
        return len(self._assigned_cards(obj))

    def get_total_cards_activated(self, obj):
        return sum(card.status == "ACTIVE" for card in self._assigned_cards(obj))


class PurchaserOrderSerializer(AdminOrderSerializer):
    customer_name = serializers.CharField(source="purchaser_name", read_only=True)
    customer_email = serializers.CharField(source="purchaser_email", read_only=True)
    customer_phone = serializers.CharField(source="purchaser_phone", read_only=True)

    def get_delivery(self, obj):
        delivery = super().get_delivery(obj)
        delivery.update(full_name=obj.purchaser_name, email=obj.purchaser_email,
                        phone=obj.delivery_phone or obj.purchaser_phone)
        return delivery


class AdminPurchaserDetailSerializer(AdminPurchaserSerializer):
    order = PurchaserOrderSerializer(source="*", read_only=True)

    class Meta(AdminPurchaserSerializer.Meta):
        fields = AdminPurchaserSerializer.Meta.fields + ["order"]
        read_only_fields = fields
