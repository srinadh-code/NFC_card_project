from rest_framework import serializers

from website_content.models import ContactMessage, ContactMessageReply


class ContactMessageCreateSerializer(serializers.ModelSerializer):
    """Public-facing — only the fields the contact form actually submits."""

    class Meta:
        model = ContactMessage
        fields = ["name", "email", "subject", "message"]


class ContactMessageReplySerializer(serializers.ModelSerializer):
    """Read-only — one entry in a message's reply history."""

    admin_name = serializers.SerializerMethodField()

    class Meta:
        model = ContactMessageReply
        fields = ["id", "content", "admin_name", "created_at"]
        read_only_fields = fields

    def get_admin_name(self, obj):
        if not obj.admin_id:
            return None
        return obj.admin.full_name or obj.admin.email


class ContactMessageReplyCreateSerializer(serializers.Serializer):
    """Validates the body of POST .../contact-messages/<id>/reply/."""

    content = serializers.CharField(trim_whitespace=True)

    def validate_content(self, value):
        if not value.strip():
            raise serializers.ValidationError("Reply message cannot be empty.")
        return value


class ContactMessageSerializer(serializers.ModelSerializer):
    """Admin-facing — read/moderate a submitted message."""

    replies = ContactMessageReplySerializer(many=True, read_only=True)
    reply_count = serializers.SerializerMethodField()

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
            "replies",
            "reply_count",
        ]
        read_only_fields = [
            "name",
            "email",
            "subject",
            "message",
            "created_at",
            "replies",
            "reply_count",
        ]

    def get_reply_count(self, obj):
        return obj.replies.count()
