from rest_framework import serializers

from .models import CustomerAddress


class CustomerAddressSerializer(serializers.ModelSerializer):
    class Meta:
        model = CustomerAddress
        fields = [
            "id",
            "label",
            "full_name",
            "phone",
            "address_line1",
            "address_line2",
            "landmark",
            "locality",
            "city",
            "district",
            "state",
            "pincode",
            "country",
            "is_default",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["id", "created_at", "updated_at"]

    def validate_pincode(self, value):
        value = value.strip()
        if not (value.isdigit() and len(value) == 6):
            raise serializers.ValidationError("PIN code must contain exactly 6 digits.")
        return value

    def validate_full_name(self, value):
        value = value.strip()
        if not value:
            raise serializers.ValidationError("Please enter a full name.")
        return value

    def validate_address_line1(self, value):
        value = value.strip()
        if not value:
            raise serializers.ValidationError("Please enter an address.")
        return value
