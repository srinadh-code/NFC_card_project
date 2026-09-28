from rest_framework import serializers

from website_content.models import (
    HomeCTA,
    HomeBottomBarItem,
    HomeHero,
    HomeHeroFeatureHighlight,
    HomeHowItFeels,
    HomeHowItFeelsPoint,
    HomeOurStory,
)


class HomeHeroSerializer(serializers.ModelSerializer):
    phone_image_url = serializers.CharField(read_only=True)
    nfc_card_image_url = serializers.CharField(read_only=True)

    class Meta:
        model = HomeHero
        fields = [
            "id",
            "badge",
            "heading_line1",
            "heading_line2",
            "description",
            "primary_cta_text",
            "primary_cta_link",
            "secondary_cta_text",
            "secondary_cta_link",
            "phone_image_url",
            "nfc_card_image_url",
            "is_active",
        ]


class HomeHeroFeatureHighlightSerializer(serializers.ModelSerializer):
    class Meta:
        model = HomeHeroFeatureHighlight
        fields = ["id", "icon", "label", "description", "display_order", "is_active"]


class HomeBottomBarItemSerializer(serializers.ModelSerializer):
    class Meta:
        model = HomeBottomBarItem
        fields = ["id", "icon", "title", "description", "display_order", "is_active"]


class HomeHowItFeelsSerializer(serializers.ModelSerializer):
    image_url = serializers.CharField(read_only=True)

    class Meta:
        model = HomeHowItFeels
        fields = ["id", "badge", "heading", "description", "image_url", "is_active"]


class HomeOurStorySerializer(serializers.ModelSerializer):
    image_url = serializers.CharField(read_only=True)

    class Meta:
        model = HomeOurStory
        fields = ["id", "image_url", "is_active"]


class HomeHowItFeelsPointSerializer(serializers.ModelSerializer):
    class Meta:
        model = HomeHowItFeelsPoint
        fields = ["id", "icon", "text", "display_order", "is_active"]


class HomeCTASerializer(serializers.ModelSerializer):
    class Meta:
        model = HomeCTA
        fields = ["id", "heading", "description", "button_text", "button_link", "is_active"]
