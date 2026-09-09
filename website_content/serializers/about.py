from rest_framework import serializers

from website_content.models import (
    AboutBuiltFromExperience,
    AboutFeatureHighlight,
    AboutMission,
    AboutPage,
    AboutWhyChoose,
)


class AboutPageSerializer(serializers.ModelSerializer):
    class Meta:
        model = AboutPage
        fields = [
            "id",
            "page_title",
            "page_subtitle",
            "story_badge",
            "story_title",
            "story_paragraph_1",
            "story_paragraph_2",
            "is_active",
        ]


class AboutFeatureHighlightSerializer(serializers.ModelSerializer):
    class Meta:
        model = AboutFeatureHighlight
        fields = ["id", "label", "icon", "display_order", "is_active"]


class AboutMissionSerializer(serializers.ModelSerializer):
    class Meta:
        model = AboutMission
        fields = ["id", "badge", "heading", "description", "is_active"]


class AboutWhyChooseSerializer(serializers.ModelSerializer):
    class Meta:
        model = AboutWhyChoose
        fields = ["id", "title", "description", "icon", "gradient", "display_order", "is_active"]


class AboutBuiltFromExperienceSerializer(serializers.ModelSerializer):
    image_url = serializers.CharField(read_only=True)

    class Meta:
        model = AboutBuiltFromExperience
        fields = ["id", "heading", "subtitle", "paragraph_1", "paragraph_2", "image_url", "is_active"]
