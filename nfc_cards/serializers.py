from rest_framework import serializers

from .models import NfcCard


class NfcCardSerializer(serializers.ModelSerializer):
    customer_name = serializers.SerializerMethodField()

    class Meta:
        model = NfcCard
        fields = [
            "id",
            "uid",
            "serial_number",
            "card_type",
            "color",
            "status",
            "customer_name",
            "assigned_on",
            "activated_on",
            "purchase_date",
            "notes",
        ]
        read_only_fields = fields

    def get_customer_name(self, obj):
        return obj.user.full_name if obj.user_id else None


class ActivateCardSerializer(serializers.Serializer):
    uid = serializers.CharField(max_length=32)
