import re

from rest_framework import serializers

from .models import Lead


class LeadSerializer(serializers.ModelSerializer):
    class Meta:
        model = Lead
        fields = ["id", "name", "email", "phone", "company", "message", "status", "created_at"]
        read_only_fields = fields


class UpdateLeadStatusSerializer(serializers.Serializer):
    status = serializers.ChoiceField(choices=Lead.Status.choices)


#: Visitors can be anywhere, so this accepts 7-15 digits (E.164 range) with
#: the usual separators rather than the Indian-only 10-digit rule used at
#: registration. Keep in sync with isValidEnquiryPhone() in ContactUsSection.tsx.
_PHONE_ALLOWED_RE = re.compile(r"^\+?[\d\s\-()]+$")


class SubmitLeadSerializer(serializers.Serializer):
    username = serializers.SlugField(max_length=60)
    name = serializers.CharField(max_length=150)
    email = serializers.EmailField()
    phone = serializers.CharField(max_length=20)
    company = serializers.CharField(max_length=150, required=False, allow_blank=True, default="")
    message = serializers.CharField(max_length=2000)

    def validate_phone(self, value):
        value = value.strip()
        digits = re.sub(r"\D", "", value)
        if not _PHONE_ALLOWED_RE.match(value) or not 7 <= len(digits) <= 15:
            raise serializers.ValidationError("Enter a valid phone number.")
        return value
