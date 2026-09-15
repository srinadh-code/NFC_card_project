from rest_framework import serializers

from website_content.models import (
    EmailSettings,
    GeneralSettings,
    PaymentSettings,
    SecuritySettings,
    ShippingSettings,
)


class GeneralSettingsSerializer(serializers.ModelSerializer):
    """Admin read/write — includes bookkeeping fields."""

    class Meta:
        model = GeneralSettings
        fields = [
            "id",
            "site_name",
            "site_email",
            "site_phone",
            "site_address",
            "currency",
            "timezone",
            "updated_at",
        ]
        read_only_fields = ["id", "updated_at"]


class PaymentSettingsSerializer(serializers.ModelSerializer):
    """`razorpay_secret` is write-only — a GET never echoes back a stored
    credential. `has_secret` tells the admin UI whether one is already
    configured without ever revealing it; leaving the field blank on a
    PATCH leaves the stored secret untouched (there's no way for the UI to
    resubmit a value it was never given back)."""

    razorpay_secret = serializers.CharField(write_only=True, required=False, allow_blank=True)
    has_secret = serializers.SerializerMethodField()

    class Meta:
        model = PaymentSettings
        fields = ["id", "razorpay_key_id", "razorpay_secret", "has_secret", "cod_enabled", "updated_at"]
        read_only_fields = ["id", "updated_at"]

    def get_has_secret(self, obj):
        return bool(obj.razorpay_secret)

    def update(self, instance, validated_data):
        if "razorpay_secret" in validated_data and not validated_data["razorpay_secret"]:
            validated_data.pop("razorpay_secret")
        return super().update(instance, validated_data)


class ShippingSettingsSerializer(serializers.ModelSerializer):
    class Meta:
        model = ShippingSettings
        fields = ["id", "flat_rate", "free_shipping_threshold", "updated_at"]
        read_only_fields = ["id", "updated_at"]


class EmailSettingsSerializer(serializers.ModelSerializer):
    class Meta:
        model = EmailSettings
        fields = ["id", "smtp_host", "smtp_port", "from_address", "updated_at"]
        read_only_fields = ["id", "updated_at"]


class SecuritySettingsSerializer(serializers.ModelSerializer):
    class Meta:
        model = SecuritySettings
        fields = ["id", "access_token_minutes", "min_password_length", "require_special_char", "updated_at"]
        read_only_fields = ["id", "updated_at"]

    def validate_access_token_minutes(self, value):
        if value < 1:
            raise serializers.ValidationError("Must be at least 1 minute.")
        return value

    def validate_min_password_length(self, value):
        if value < 6:
            raise serializers.ValidationError("Must be at least 6 characters.")
        return value


class PublicGeneralSettingsSerializer(serializers.ModelSerializer):
    """Public read-only — only the fields the public website is allowed to see.

    Deliberately excludes id/timestamps/is_active; GeneralSettings itself
    never holds credentials or secrets, but this keeps the public payload
    scoped to exactly what the spec calls for.
    """

    class Meta:
        model = GeneralSettings
        fields = [
            "site_name",
            "site_email",
            "site_phone",
            "site_address",
            "currency",
            "timezone",
        ]
