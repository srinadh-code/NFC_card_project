from rest_framework import serializers

from website_content.models import Value


class ValueSerializer(serializers.ModelSerializer):
    class Meta:
        model = Value
        fields = ["id", "title", "description", "icon", "display_order", "is_active"]
