import re

from rest_framework import serializers

from .models import Announcement, Notification

# Accepts an internal path ("/order-card") or an absolute http(s) URL —
# never a bare string that would silently render as a dead link. Internal
# paths are the common case (the example in the spec is "/order-card").
_CTA_LINK_RE = re.compile(r"^(/[^\s]*|https?://[^\s]+)$")


class AnnouncementSerializer(serializers.ModelSerializer):
    """Full admin read shape — includes everything a "Previously Sent" row
    needs (offer fields, schedule, the computed 4-state status)."""

    created_by_name = serializers.CharField(source="created_by.full_name", read_only=True, default=None)
    status = serializers.SerializerMethodField()

    class Meta:
        model = Announcement
        fields = [
            "id",
            "title",
            "message",
            "announcement_type",
            "display_location",
            "is_published",
            "status",
            "start_at",
            "end_at",
            "offer_title",
            "discount_type",
            "discount_percentage",
            "discount_amount",
            "promo_code",
            "automatic_apply",
            "applies_to_all_products",
            "applicable_card_types",
            "first_order_only",
            "cta_text",
            "cta_link",
            "created_by_name",
            "recipient_count",
            "created_at",
            "updated_at",
        ]
        read_only_fields = fields

    def get_status(self, obj):
        return obj.effective_status()


class AnnouncementWriteSerializer(serializers.ModelSerializer):
    """Admin create/update — both "Save Draft" (is_published omitted or
    false) and "Publish" (is_published true) go through this same
    serializer; the view/service decides whether that triggers a fan-out.
    Offer fields are never required just because announcement_type is
    OFFER (see the spec's "offer without promo code / discount" edge
    cases) — only their own value ranges are validated when present."""

    class Meta:
        model = Announcement
        fields = [
            "title",
            "message",
            "announcement_type",
            "display_location",
            "is_published",
            "start_at",
            "end_at",
            "offer_title",
            "discount_type",
            "discount_percentage",
            "discount_amount",
            "promo_code",
            "automatic_apply",
            "applies_to_all_products",
            "applicable_card_types",
            "first_order_only",
            "cta_text",
            "cta_link",
        ]
        extra_kwargs = {
            "message": {"required": True, "allow_blank": False},
            "is_published": {"required": False, "default": False},
        }

    def validate_discount_percentage(self, value):
        if value is not None and not (0 <= value <= 100):
            raise serializers.ValidationError("Discount percentage must be between 0 and 100.")
        return value

    def validate_discount_amount(self, value):
        if value is not None and value < 0:
            raise serializers.ValidationError("Discount amount cannot be negative.")
        return value

    def validate_applicable_card_types(self, value):
        if not value:
            return value
        from website_content.models import OrderCardProduct

        valid = set(OrderCardProduct.CardType.values)
        given = {c.strip().upper() for c in value.split(",") if c.strip()}
        unknown = given - valid
        if unknown:
            raise serializers.ValidationError(f"Unknown product type(s): {', '.join(sorted(unknown))}.")
        return ",".join(sorted(given))

    def validate_cta_link(self, value):
        if value and not _CTA_LINK_RE.match(value):
            raise serializers.ValidationError(
                "CTA link must be an internal path (e.g. /order-card) or a full https:// URL."
            )
        return value

    def validate(self, attrs):
        # `self.instance` is set on update — fall back to the existing
        # value for any field this partial PATCH didn't touch, so editing
        # just e.g. the title can't spuriously fail this check against a
        # stale start_at/end_at that was never actually being changed.
        def current(field, default=None):
            return attrs.get(field, getattr(self.instance, field, default))

        start_at = current("start_at")
        end_at = current("end_at")
        if start_at and end_at and start_at > end_at:
            raise serializers.ValidationError({"end_at": "End date cannot be before the start date."})

        if not current("applies_to_all_products", True) and not current("applicable_card_types", ""):
            raise serializers.ValidationError(
                {"applicable_card_types": "Select at least one product, or apply to all products."}
            )

        # A fixed discount can never exceed the price of every product it
        # might apply to — checked here (not just clamped silently at
        # calculation time) so an admin gets a real validation error
        # instead of a discount that quietly turns out to be 100% off.
        if current("discount_type") == Announcement.DiscountType.FIXED:
            discount_amount = current("discount_amount")
            if discount_amount is not None:
                from common.discounts import get_product_price
                from website_content.models import OrderCardProduct

                if current("applies_to_all_products", True):
                    card_types = OrderCardProduct.CardType.values
                else:
                    card_types = [c.strip() for c in current("applicable_card_types", "").split(",") if c.strip()]
                for card_type in card_types:
                    price = get_product_price(card_type)
                    if price is not None and discount_amount > price:
                        raise serializers.ValidationError(
                            {
                                "discount_amount": (
                                    f"Fixed discount (₹{discount_amount}) cannot exceed the price of "
                                    f"{card_type.title()} (₹{price})."
                                )
                            }
                        )

        return attrs


class PublicAnnouncementSerializer(serializers.ModelSerializer):
    """What the public, unauthenticated marketing site is allowed to see —
    no created_by, no recipient_count, no is_published/status (the query
    that produced this list already guarantees "currently active")."""

    class Meta:
        model = Announcement
        fields = [
            "id",
            "title",
            "message",
            "announcement_type",
            "offer_title",
            "discount_type",
            "discount_percentage",
            "discount_amount",
            "promo_code",
            "cta_text",
            "cta_link",
            "start_at",
            "end_at",
        ]
        read_only_fields = fields


class NotificationSerializer(serializers.ModelSerializer):
    """Same shape as before, plus a handful of read-only fields that are
    only ever non-null when this notification came from an Announcement
    with offer details (announcement_type/cta_text/cta_link) — lets the
    existing notification bell render a "View Offer" button without a
    second customer-facing announcements endpoint."""

    announcement_type = serializers.CharField(source="announcement.announcement_type", read_only=True, default=None)
    cta_text = serializers.CharField(source="announcement.cta_text", read_only=True, default="")
    cta_link = serializers.CharField(source="announcement.cta_link", read_only=True, default="")

    class Meta:
        model = Notification
        fields = [
            "id",
            "title",
            "message",
            "type",
            "is_read",
            "created_at",
            "announcement_type",
            "cta_text",
            "cta_link",
        ]
        read_only_fields = fields


class MarkNotificationsReadSerializer(serializers.Serializer):
    ids = serializers.ListField(child=serializers.IntegerField(), required=False, default=list)
    all = serializers.BooleanField(required=False, default=False)

    def validate(self, attrs):
        if not attrs["all"] and not attrs["ids"]:
            raise serializers.ValidationError("Provide `ids` to mark, or set `all` to true.")
        return attrs
