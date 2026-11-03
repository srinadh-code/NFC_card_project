from decimal import Decimal

from django.db import transaction
from rest_framework import serializers

from common.discounts import get_product_pricing
from customer_management.customer_cart.serializers import MAX_LINE_QTY
from website_content.models import (
    OrderCardPageSettings,
    OrderCardProduct,
    OrderCardProductFeature,
    OrderCardProductImage,
    OrderCardProductOffer,
    OrderCardProductTimelineStage,
    OrderCardTrustBadge,
    ProfileTemplatePreview,
)
from website_content.models.order_card import MAX_SLUG_LENGTH


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


class OrderCardProductImageSerializer(serializers.ModelSerializer):
    class Meta:
        model = OrderCardProductImage
        fields = ["id", "image_url", "alt_text", "is_primary", "display_order"]
        read_only_fields = ["id", "image_url", "is_primary", "display_order"]


class OrderCardProductFeatureSerializer(serializers.ModelSerializer):
    class Meta:
        model = OrderCardProductFeature
        fields = ["id", "label", "icon", "display_order", "is_active"]
        read_only_fields = ["id", "display_order"]


class OrderCardProductOfferSerializer(serializers.ModelSerializer):
    min_quantity = serializers.IntegerField(min_value=1, max_value=MAX_LINE_QTY)
    unit_price = serializers.DecimalField(max_digits=10, decimal_places=2, min_value=Decimal("0.01"))

    class Meta:
        model = OrderCardProductOffer
        fields = ["id", "label", "min_quantity", "unit_price", "savings_text", "display_order", "is_active"]
        read_only_fields = ["id", "display_order"]


class OrderCardProductTimelineStageSerializer(serializers.ModelSerializer):
    class Meta:
        model = OrderCardProductTimelineStage
        fields = ["id", "title", "description", "estimate", "icon", "display_order", "is_active"]
        read_only_fields = ["id", "display_order"]


#: Child collections saved together with the product, each a full ordered
#: list (replace-all) — the admin edits them inside the product form.
NESTED_COLLECTIONS = {
    "feature_items": OrderCardProductFeature,
    "offers": OrderCardProductOffer,
    "timeline_stages": OrderCardProductTimelineStage,
}


class OrderCardProductSerializer(serializers.ModelSerializer):
    """Admin catalog editor (Website Content → Order Card). Features, bulk
    pricing offers and timeline stages are nested lists saved with the
    product; gallery images have their own upload endpoints (see
    views/admin.py) and are read-only here.

    The automatic-offer pricing fields below are the same real numbers
    Cart/Checkout/Order creation compute via common.discounts, just
    previewed here before anything is added to a cart. Never a promo
    code's discount (that's only ever known once a customer enters one) —
    only what applies automatically."""

    product_id = serializers.CharField(read_only=True)
    image_url = serializers.CharField(read_only=True)
    customisation_image_url = serializers.CharField(read_only=True)
    images = OrderCardProductImageSerializer(many=True, read_only=True)
    feature_items = OrderCardProductFeatureSerializer(many=True, required=False)
    offers = OrderCardProductOfferSerializer(many=True, required=False)
    timeline_stages = OrderCardProductTimelineStageSerializer(many=True, required=False)
    # Newline-joined active feature labels — kept for clients that still
    # read the old single-text `features` field.
    features = serializers.SerializerMethodField()
    discounted_price = serializers.SerializerMethodField()
    discount_amount = serializers.SerializerMethodField()
    offer_title = serializers.SerializerMethodField()

    class Meta:
        model = OrderCardProduct
        fields = [
            "id",
            "product_id",
            "slug",
            "name",
            "short_description",
            "full_description",
            "price",
            "discounted_price",
            "discount_amount",
            "offer_title",
            "design",
            "best_for",
            "template_count",
            "features",
            "feature_items",
            "offers",
            "timeline_stages",
            "images",
            "card_type",
            "card_tone",
            "image_url",
            "image_caption",
            "color_name",
            "color_hex",
            "theme_plan_copy",
            "customisation_heading",
            "customisation_description",
            "customisation_instructions",
            "customisation_notes",
            "customisation_image_url",
            "popular",
            "display_order",
            "is_active",
            "is_published",
        ]

    def _pricing(self, obj):
        return get_product_pricing(obj.card_type, product_id=obj.product_id) or {
            "discount_amount": 0,
            "final_price": obj.price,
            "offer": None,
        }

    def get_features(self, obj):
        return "\n".join(f.label for f in obj.feature_items.all() if f.is_active)

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
        if len(value) > MAX_SLUG_LENGTH:
            raise serializers.ValidationError(f"Use at most {MAX_SLUG_LENGTH} characters.")
        qs = OrderCardProduct.objects.filter(slug__iexact=value)
        if self.instance is not None:
            qs = qs.exclude(pk=self.instance.pk)
        if qs.exists():
            raise serializers.ValidationError("A product with this slug already exists.")
        return value

    def validate_price(self, value):
        if value <= 0:
            raise serializers.ValidationError("Price must be greater than 0.")
        return value

    def validate_offers(self, offers):
        quantities = [o["min_quantity"] for o in offers]
        if len(quantities) != len(set(quantities)):
            raise serializers.ValidationError("Each offer needs a different quantity.")
        for offer in offers:
            if not offer.get("label", "").strip():
                raise serializers.ValidationError("Every offer needs a label (e.g. \"Buy 3\").")
        active = sorted((o for o in offers if o.get("is_active", True)), key=lambda o: o["min_quantity"])
        if active and active[0]["min_quantity"] != 1:
            raise serializers.ValidationError("Add a visible quantity-1 offer (the single-card price).")
        for smaller, larger in zip(active, active[1:]):
            if larger["unit_price"] > smaller["unit_price"]:
                raise serializers.ValidationError(
                    f'"{larger["label"]}" can\'t cost more per card than "{smaller["label"]}".'
                )
        return offers

    def validate(self, attrs):
        offers = attrs.get("offers")
        if offers is not None:
            single = next((o for o in offers if o.get("is_active", True) and o["min_quantity"] == 1), None)
            # The product's own price always equals its single-card tier.
            if single is not None:
                attrs["price"] = single["unit_price"]
        if self.instance is None and attrs.get("price") is None:
            raise serializers.ValidationError({"price": ["Set a price or a quantity-1 offer."]})
        return attrs

    @transaction.atomic
    def create(self, validated_data):
        nested = {key: validated_data.pop(key, None) for key in NESTED_COLLECTIONS}
        product = OrderCardProduct.objects.create(**validated_data)
        self._save_nested(product, nested)
        return product

    @transaction.atomic
    def update(self, instance, validated_data):
        nested = {key: validated_data.pop(key, None) for key in NESTED_COLLECTIONS}
        product = super().update(instance, validated_data)
        self._save_nested(product, nested)
        return product

    def _save_nested(self, product, nested):
        for key, rows in nested.items():
            if rows is None:
                continue  # not sent: leave this collection as it is
            model = NESTED_COLLECTIONS[key]
            model.objects.filter(product=product).delete()
            model.objects.bulk_create(
                [model(product=product, display_order=index, **row) for index, row in enumerate(rows)]
            )


class PublicOrderCardProductSerializer(OrderCardProductSerializer):
    """The /shop payload: same shape as the admin serializer, minus hidden
    features, offers and timeline stages."""

    feature_items = serializers.SerializerMethodField()
    offers = serializers.SerializerMethodField()
    timeline_stages = serializers.SerializerMethodField()

    def get_feature_items(self, obj):
        return OrderCardProductFeatureSerializer([f for f in obj.feature_items.all() if f.is_active], many=True).data

    def get_offers(self, obj):
        return OrderCardProductOfferSerializer(obj.active_offers(), many=True).data

    def get_timeline_stages(self, obj):
        stages = [s for s in obj.timeline_stages.all() if s.is_active]
        return OrderCardProductTimelineStageSerializer(stages, many=True).data


class OrderCardTrustBadgeSerializer(serializers.ModelSerializer):
    class Meta:
        model = OrderCardTrustBadge
        fields = ["id", "icon", "label", "display_order", "is_active"]


class ProfileTemplatePreviewSerializer(serializers.ModelSerializer):
    image_url = serializers.CharField(read_only=True)

    class Meta:
        model = ProfileTemplatePreview
        fields = ["id", "template_id", "image_url", "display_order", "is_active"]
