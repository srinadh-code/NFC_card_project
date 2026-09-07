# Admin-facing NFC card serializers. Operate on nfc_cards.models.NfcCard —
# the domain app stays the single source of truth for the model; this
# package only owns the admin read/write *shapes* around it.
import secrets

from rest_framework import serializers

from accounts.models import User
from nfc_cards.models import NfcCard


class NfcCardAdminSerializer(serializers.ModelSerializer):
    """Read/output representation for the admin card inventory screen."""

    customer_id = serializers.IntegerField(source="user_id", read_only=True)
    customer_name = serializers.SerializerMethodField()
    customer_email = serializers.SerializerMethodField()

    class Meta:
        model = NfcCard
        fields = [
            "id",
            "uid",
            "serial_number",
            "card_type",
            "color",
            "status",
            "customer_id",
            "customer_name",
            "customer_email",
            "assigned_on",
            "activated_on",
            "purchase_date",
            "notes",
        ]
        read_only_fields = fields

    def get_customer_name(self, obj):
        return obj.user.full_name if obj.user_id else None

    def get_customer_email(self, obj):
        return obj.user.email if obj.user_id else None


def generate_uid():
    candidate = f"04{secrets.token_hex(4).upper()}"
    while NfcCard.objects.filter(uid=candidate).exists():
        candidate = f"04{secrets.token_hex(4).upper()}"
    return candidate


class AdminCardWriteSerializer(serializers.Serializer):
    """Shared validation for admin create/edit — a plain Serializer (not a
    ModelSerializer) so blank uid/serial_number can be auto-generated before
    the uniqueness check runs, and so `customer_email` (not a model field)
    can be resolved to a user in the view."""

    uid = serializers.CharField(max_length=32, required=False, allow_blank=True)
    serial_number = serializers.CharField(max_length=20, required=False, allow_blank=True)
    card_type = serializers.ChoiceField(choices=NfcCard.CardType.choices, required=False)
    color = serializers.CharField(max_length=30, required=False)
    status = serializers.ChoiceField(choices=NfcCard.Status.choices, required=False)
    purchase_date = serializers.DateField(required=False, allow_null=True)
    notes = serializers.CharField(required=False, allow_blank=True)
    customer_email = serializers.EmailField(required=False, allow_blank=True)

    def __init__(self, *args, existing_card=None, **kwargs):
        self._existing_card = existing_card
        super().__init__(*args, **kwargs)

    def validate_uid(self, value):
        value = value.strip()
        if not value:
            return value
        qs = NfcCard.objects.filter(uid__iexact=value)
        if self._existing_card:
            qs = qs.exclude(pk=self._existing_card.pk)
        if qs.exists():
            raise serializers.ValidationError("A card with this UID is already registered.")
        return value

    def validate_serial_number(self, value):
        value = value.strip()
        if not value:
            return value
        qs = NfcCard.objects.filter(serial_number__iexact=value)
        if self._existing_card:
            qs = qs.exclude(pk=self._existing_card.pk)
        if qs.exists():
            raise serializers.ValidationError("A card with this serial number is already registered.")
        return value

    def validate_customer_email(self, value):
        value = value.strip().lower()
        if not value:
            return value
        customer = User.objects.filter(email=value, role=User.Role.CUSTOMER).first()
        if customer is None:
            raise serializers.ValidationError("No customer account found with that email.")
        return value


class AdminCardAssignSerializer(serializers.Serializer):
    email = serializers.EmailField()

    def validate_email(self, value):
        value = value.strip().lower()
        customer = User.objects.filter(email=value, role=User.Role.CUSTOMER).first()
        if customer is None:
            raise serializers.ValidationError("No customer account found with that email.")
        return value
