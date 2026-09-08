from rest_framework import serializers

from website_content.models import Feature


class FeatureSerializer(serializers.ModelSerializer):
    class Meta:
        model = Feature
        fields = ["id", "icon", "title", "description", "display_order", "is_active"]
