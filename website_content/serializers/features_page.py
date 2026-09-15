from rest_framework import serializers

from website_content.models import (
    FeaturesAnalyticsSection,
    FeaturesCTA,
    FeaturesPageCard,
    FeaturesPageSettings,
    FeaturesShowcaseSection,
)


class FeaturesPageSettingsSerializer(serializers.ModelSerializer):
    hero_image_url = serializers.CharField(read_only=True)

    class Meta:
        model = FeaturesPageSettings
        fields = [
            "id",
            "page_title",
            "page_subtitle",
            "hero_badge",
            "hero_heading_line1",
            "hero_heading_line2",
            "hero_description",
            "hero_image_url",
            "primary_cta_text",
            "primary_cta_url",
            "secondary_cta_text",
            "secondary_cta_url",
            "trust_badge_text",
            "trusted_users_count",
            "features_grid_heading",
            "features_grid_subtitle",
            "is_active",
        ]


class FeaturesPageCardSerializer(serializers.ModelSerializer):
    image_url = serializers.CharField(read_only=True)

    class Meta:
        model = FeaturesPageCard
        fields = [
            "id",
            "title",
            "description",
            "icon",
            "image_url",
            "gradient",
            "cta_text",
            "cta_url",
            "display_order",
            "is_active",
        ]


class FeaturesAnalyticsSectionSerializer(serializers.ModelSerializer):
    dashboard_image_url = serializers.CharField(read_only=True)

    class Meta:
        model = FeaturesAnalyticsSection
        fields = [
            "id",
            "badge",
            "heading",
            "description",
            "dashboard_image_url",
            "cta_text",
            "cta_url",
            "is_active",
        ]


class FeaturesShowcaseSectionSerializer(serializers.ModelSerializer):
    main_image_url = serializers.CharField(read_only=True)
    card_image_url = serializers.CharField(read_only=True)

    class Meta:
        model = FeaturesShowcaseSection
        fields = [
            "id",
            "badge",
            "heading",
            "description",
            "main_image_url",
            "card_image_url",
            "is_active",
        ]


class FeaturesCTASerializer(serializers.ModelSerializer):
    background_image_url = serializers.CharField(read_only=True)

    class Meta:
        model = FeaturesCTA
        fields = [
            "id",
            "heading",
            "description",
            "button_text",
            "button_url",
            "background_image_url",
            "is_active",
        ]
