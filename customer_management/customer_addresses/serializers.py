from rest_framework import serializers

from . import geocoding
from . import pincode as pincode_service
from .models import CustomerAddress


class CustomerAddressSerializer(serializers.ModelSerializer):
    # Not stored — the customer explicitly keeping a district India Post
    # and the legacy-district mapping don't list for this PIN (see
    # pincode.verify_address). Only honoured once the locality is proven.
    confirm_district = serializers.BooleanField(write_only=True, required=False, default=False)
    # The map pin, if the customer used "Choose on Map" — floats in/out
    # (not the model's decimal strings), rounded to the column's 6 places.
    latitude = serializers.FloatField(required=False, allow_null=True, min_value=-90, max_value=90)
    longitude = serializers.FloatField(required=False, allow_null=True, min_value=-180, max_value=180)

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
            "latitude",
            "longitude",
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
        self._validate_coordinates(attrs)
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

    def _validate_coordinates(self, attrs):
        # Optional (typed addresses have none), but a pin is a pair and must
        # be somewhere we deliver.
        if "latitude" not in attrs and "longitude" not in attrs:
            return
        saved = lambda name: getattr(self.instance, name, None) if self.instance else None
        lat, lng = attrs.get("latitude", saved("latitude")), attrs.get("longitude", saved("longitude"))
        if lat is None and lng is None:
            return
        if lat is None or lng is None:
            raise serializers.ValidationError({"latitude": "Please choose the location on the map again."})
        lat, lng = round(float(lat), 6), round(float(lng), 6)
        if not geocoding.in_india_bounds(lat, lng):
            raise serializers.ValidationError({"latitude": geocoding.OUTSIDE_INDIA_MESSAGE})
        attrs["latitude"], attrs["longitude"] = lat, lng
