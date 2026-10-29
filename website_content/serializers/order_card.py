from rest_framework import serializers

from common.discounts import get_product_pricing
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
    """Shared by both the admin catalog editor and the public /shop
    listing (OrderCardPublicView) — the automatic-offer pricing fields
    below are the same real numbers Cart/Checkout/Order creation compute
    via common.discounts, just previewed here before anything is added to
    a cart. Never a promo code's discount (that's only ever known once a
    customer enters one) — only what applies automatically."""

    image_url = serializers.CharField(read_only=True)
    discounted_price = serializers.SerializerMethodField()
    discount_amount = serializers.SerializerMethodField()
    offer_title = serializers.SerializerMethodField()

    class Meta:
        model = OrderCardProduct
        fields = [
            "id",
            "slug",
            "name",
            "price",
            "discounted_price",
            "discount_amount",
            "offer_title",
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

    def _pricing(self, obj):
        return get_product_pricing(obj.card_type) or {
            "discount_amount": 0,
            "final_price": obj.price,
            "offer": None,
        }

    def get_discounted_price(self, obj):
        pricing = self._pricing(obj)
        return pricing["final_price"] if pricing["offer"] else None

    def get_discount_amount(self, obj):
        pricing = self._pricing(obj)
        return pricing["discount_amount"] if pricing["offer"] else None

    def get_offer_title(self, obj):
        offer = self._pricing(obj)["offer"]
        return (offer.offer_title or offer.title) if offer else None

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
