from rest_framework import serializers

from .models import Notification


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
