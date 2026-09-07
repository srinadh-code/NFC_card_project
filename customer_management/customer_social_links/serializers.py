from django.core.exceptions import ValidationError as DjangoValidationError
from django.core.validators import URLValidator
from rest_framework import serializers

from profiles.models import SOCIAL_PLATFORMS


class SocialLinkItemSerializer(serializers.Serializer):
    platform = serializers.ChoiceField(choices=SOCIAL_PLATFORMS)
    url = serializers.CharField(required=False, allow_blank=True, max_length=200)
    enabled = serializers.BooleanField(required=False, default=True)
    display_order = serializers.IntegerField(required=False, min_value=0, default=0)

    def validate_url(self, value):
        if not value:
            return value
        try:
            URLValidator()(value)
        except DjangoValidationError:
            raise serializers.ValidationError("Enter a valid URL.")
        return value


class CustomerSocialLinksUpdateSerializer(serializers.Serializer):
    links = SocialLinkItemSerializer(many=True, allow_empty=False)

    def validate_links(self, value):
        platforms = [item["platform"] for item in value]
        if len(platforms) != len(set(platforms)):
            raise serializers.ValidationError(
                "Each platform can only appear once — remove the duplicate entry."
            )
        return value
