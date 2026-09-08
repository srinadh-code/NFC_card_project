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


class NfcCardMiniSerializer(serializers.ModelSerializer):
    """Card fields nested inside another resource's response (e.g. the admin
    customer-detail payload) — no customer_* fields since the parent
    resource already identifies the customer."""

    class Meta:
        model = NfcCard
        fields = [
            "id",
            "uid",
            "serial_number",
            "card_type",
            "color",
            "status",
            "assigned_on",
            "activated_on",
            "purchase_date",
        ]
        read_only_fields = fields


class ActivateCardSerializer(serializers.Serializer):
    uid = serializers.CharField(max_length=32)


class TrackEventSerializer(serializers.Serializer):
    """Public engagement tracking: the frontend calls this once it takes an
    action on an already-resolved card (saved contact / shared profile) —
    actions that happen client-side and would otherwise never reach the
    backend at all."""

    uid = serializers.CharField(max_length=32)
    action = serializers.ChoiceField(choices=["contact_saved", "shared"])


class DeactivateCardSerializer(serializers.Serializer):
    uid = serializers.CharField(max_length=32)
