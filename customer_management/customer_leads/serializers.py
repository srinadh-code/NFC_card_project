from rest_framework import serializers

from .models import Lead


class LeadSerializer(serializers.ModelSerializer):
    class Meta:
        model = Lead
        fields = ["id", "name", "email", "phone", "company", "message", "created_at"]
        read_only_fields = fields


class SubmitLeadSerializer(serializers.Serializer):
    username = serializers.SlugField(max_length=60)
    name = serializers.CharField(max_length=150)
    email = serializers.EmailField(required=False, allow_blank=True, default="")
    phone = serializers.CharField(max_length=20, required=False, allow_blank=True, default="")
    company = serializers.CharField(max_length=150, required=False, allow_blank=True, default="")
    message = serializers.CharField(required=False, allow_blank=True, default="")

    def validate(self, attrs):
        if not attrs.get("email") and not attrs.get("phone"):
            raise serializers.ValidationError("Provide at least an email or a phone number.")
        return attrs
