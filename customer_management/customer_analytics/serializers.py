from rest_framework import serializers

from profiles.models import SOCIAL_PLATFORMS

from .models import AnalyticsEvent


class AnalyticsEventSerializer(serializers.ModelSerializer):
    class Meta:
        model = AnalyticsEvent
        fields = ["id", "event_type", "device", "ip_address", "source", "metadata", "created_at"]
        read_only_fields = fields


class TrackSocialClickSerializer(serializers.Serializer):
    username = serializers.SlugField(max_length=60)
    platform = serializers.ChoiceField(choices=SOCIAL_PLATFORMS)
