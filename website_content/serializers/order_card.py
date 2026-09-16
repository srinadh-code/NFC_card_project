from rest_framework import serializers

from website_content.models import (
    OrderCardPageSettings,
    OrderCardProduct,
    OrderCardTrustBadge,
    ProfileTemplatePreview,
)


class OrderCardPageSettingsSerializer(serializers.ModelSerializer):
    class Meta:
        model = OrderCardPageSettings
        fields = [
            "id",
            "page_title",
            "page_subtitle",
            "theme_section_heading",
            "theme_section_subtitle",
            "is_active",
        ]


class OrderCardProductSerializer(serializers.ModelSerializer):
    image_url = serializers.CharField(read_only=True)

    class Meta:
        model = OrderCardProduct
        fields = [
            "id",
            "slug",
            "name",
            "price",
            "design",
            "best_for",
            "template_count",
            "features",
            "card_type",
            "card_tone",
            "image_url",
            "image_caption",
            "color_name",
            "color_hex",
            "theme_plan_copy",
            "popular",
            "display_order",
            "is_active",
        ]

    def validate_slug(self, value):
        qs = OrderCardProduct.objects.filter(slug__iexact=value)
        if self.instance is not None:
            qs = qs.exclude(pk=self.instance.pk)
        if qs.exists():
            raise serializers.ValidationError("A product with this slug already exists.")
        return value


class OrderCardTrustBadgeSerializer(serializers.ModelSerializer):
    class Meta:
        model = OrderCardTrustBadge
        fields = ["id", "icon", "label", "display_order", "is_active"]


class ProfileTemplatePreviewSerializer(serializers.ModelSerializer):
    image_url = serializers.CharField(read_only=True)

    class Meta:
        model = ProfileTemplatePreview
        fields = ["id", "template_id", "image_url", "display_order", "is_active"]
