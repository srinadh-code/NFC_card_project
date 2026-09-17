from rest_framework import serializers

from .models import Announcement, Notification


class AnnouncementSerializer(serializers.ModelSerializer):
    created_by_name = serializers.CharField(source="created_by.full_name", read_only=True, default=None)

    class Meta:
        model = Announcement
        fields = ["id", "title", "message", "created_by_name", "recipient_count", "created_at"]
        read_only_fields = fields


class AnnouncementCreateSerializer(serializers.Serializer):
    title = serializers.CharField(max_length=200)
    message = serializers.CharField(allow_blank=True, required=False, default="")


class NotificationSerializer(serializers.ModelSerializer):
    class Meta:
        model = Notification
        fields = ["id", "title", "message", "type", "is_read", "created_at"]
        read_only_fields = fields


class MarkNotificationsReadSerializer(serializers.Serializer):
    ids = serializers.ListField(child=serializers.IntegerField(), required=False, default=list)
    all = serializers.BooleanField(required=False, default=False)

    def validate(self, attrs):
        if not attrs["all"] and not attrs["ids"]:
            raise serializers.ValidationError("Provide `ids` to mark, or set `all` to true.")
        return attrs
