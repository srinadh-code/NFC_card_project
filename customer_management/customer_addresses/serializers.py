from rest_framework import serializers

from . import pincode as pincode_service
from .models import CustomerAddress


class CustomerAddressSerializer(serializers.ModelSerializer):
    # Not stored — the customer explicitly keeping a district India Post
    # and the legacy-district mapping don't list for this PIN (see
    # pincode.verify_address). Only honoured once the locality is proven.
    confirm_district = serializers.BooleanField(write_only=True, required=False, default=False)

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
            "confirm_district",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["id", "created_at", "updated_at"]

    def validate_pincode(self, value):
        value = value.strip()
        if not pincode_service.is_valid_pincode_format(value):
            raise serializers.ValidationError(pincode_service.FORMAT_MESSAGE)
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

    def validate(self, attrs):
        # Checked against India Post's PIN directory on every create/edit —
        # a PATCH that only touches e.g. the phone still re-checks, using
        # the saved values for whatever wasn't sent.
        confirm_district = attrs.pop("confirm_district", False)
        current = lambda name: attrs.get(name, getattr(self.instance, name, "") if self.instance else "")
        try:
            result = pincode_service.verify_address(
                locality=current("locality"),
                city=current("city"),
                district=current("district"),
                state=current("state"),
                pincode=current("pincode"),
                district_confirmed=confirm_district,
            )
        except pincode_service.PincodeServiceUnavailable:
            raise serializers.ValidationError({"pincode": pincode_service.UNAVAILABLE_MESSAGE})
        if result.errors:
            raise serializers.ValidationError(result.errors)
        return attrs
