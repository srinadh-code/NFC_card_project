from rest_framework import serializers

from website_content.models import ContactMessage


class ContactMessageCreateSerializer(serializers.ModelSerializer):
    """Public-facing — only the fields the contact form actually submits."""

    class Meta:
        model = ContactMessage
        fields = ["name", "email", "subject", "message"]


class ContactMessageSerializer(serializers.ModelSerializer):
    """Admin-facing — read/moderate a submitted message."""

    class Meta:
        model = ContactMessage
        fields = [
            "id",
            "name",
            "email",
            "subject",
            "message",
            "is_read",
            "is_resolved",
            "created_at",
        ]
        read_only_fields = ["name", "email", "subject", "message", "created_at"]
