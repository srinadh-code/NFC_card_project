from rest_framework import serializers

from website_content.models import (
    HomeCTA,
    HomeHero,
    HomeHeroFeatureHighlight,
    HomeHowItFeels,
    HomeHowItFeelsPoint,
)


class HomeHeroSerializer(serializers.ModelSerializer):
    hero_image_url = serializers.CharField(read_only=True)

    class Meta:
        model = HomeHero
        fields = [
            "id",
            "badge",
            "heading",
            "description",
            "primary_cta_text",
            "primary_cta_link",
            "secondary_cta_text",
            "secondary_cta_link",
            "hero_image_url",
            "is_active",
        ]


class HomeHeroFeatureHighlightSerializer(serializers.ModelSerializer):
    class Meta:
        model = HomeHeroFeatureHighlight
        fields = ["id", "icon", "label", "display_order", "is_active"]


class HomeHowItFeelsSerializer(serializers.ModelSerializer):
    class Meta:
        model = HomeHowItFeels
        fields = ["id", "badge", "heading", "description", "is_active"]


class HomeHowItFeelsPointSerializer(serializers.ModelSerializer):
    class Meta:
        model = HomeHowItFeelsPoint
        fields = ["id", "icon", "text", "display_order", "is_active"]


class HomeCTASerializer(serializers.ModelSerializer):
    class Meta:
        model = HomeCTA
        fields = ["id", "heading", "description", "button_text", "button_link", "is_active"]
