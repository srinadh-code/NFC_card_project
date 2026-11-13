import re

from rest_framework import serializers

from website_content.models import Company


class CompanyIntegerField(serializers.IntegerField):
    """Reject fractional/boolean input rather than coercing company order IDs."""

    def to_internal_value(self, data):
        if isinstance(data, bool) or isinstance(data, float):
            self.fail("invalid")
        if isinstance(data, str) and not re.fullmatch(r"[0-9]+", data.strip()):
            self.fail("invalid")
        return super().to_internal_value(data)


class CompanySerializer(serializers.ModelSerializer):
    logo_url = serializers.CharField(read_only=True)
    display_order = CompanyIntegerField(required=False, min_value=0, max_value=2147483647)
    is_active = serializers.BooleanField(required=False, default=serializers.CreateOnlyDefault(False))

    class Meta:
        model = Company
        fields = ["id", "name", "logo_url", "display_order", "is_active"]

    def validate_name(self, value):
        value = value.strip()
        if not value:
            raise serializers.ValidationError("Enter a company name.")
        if any(ord(character) < 32 or 127 <= ord(character) <= 159 for character in value):
            raise serializers.ValidationError("Company names must be a single line of text.")
        return value


class PublicCompanySerializer(serializers.ModelSerializer):
    """Only the active carousel's public name and ordering identity."""

    class Meta:
        model = Company
        fields = ["id", "name", "display_order"]
        read_only_fields = fields


class CompanyReorderSerializer(serializers.Serializer):
    order = serializers.ListField(
        child=CompanyIntegerField(min_value=1, max_value=2147483647),
        allow_empty=False,
    )

    def validate_order(self, value):
        if len(value) != len(set(value)):
            raise serializers.ValidationError("List each company only once.")
        return value


