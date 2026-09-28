from rest_framework import serializers

from .models import REVIEW_MAX_LENGTH, REVIEW_MIN_LENGTH, Testimonial
from .services import paid_orders


class CustomerTestimonialSerializer(serializers.ModelSerializer):
    """The customer's own view/write shape — create, update and "my"
    listing all use this. status/is_active are read-only here: only an
    admin can move a testimonial through moderation (admin_api/testimonials).

    The image itself is not a serializer field — the view uploads
    `profile_image` from request.FILES to Cloudinary and passes the
    resulting url/public_id to save(), so a failed upload never leaves a
    half-written row behind."""

    order_number = serializers.CharField(source="order.order_number", read_only=True, default=None)
    can_edit = serializers.BooleanField(source="is_editable_by_customer", read_only=True)

    class Meta:
        model = Testimonial
        fields = [
            "id",
            "order",
            "order_number",
            "profile_image",
            "name",
            "designation",
            "company",
            "rating",
            "review",
            "status",
            "is_active",
            "can_edit",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["id", "profile_image", "status", "is_active", "created_at", "updated_at"]
        extra_kwargs = {"order": {"required": False, "allow_null": True}}

    def get_fields(self):
        fields = super().get_fields()
        # Only the requester's own paid orders are selectable — another
        # customer's order id (or an unpaid one) is simply "invalid pk".
        request = self.context.get("request")
        if request is not None and request.user.is_authenticated:
            fields["order"].queryset = paid_orders(request.user)
        return fields

    def validate_name(self, value):
        value = value.strip()
        if not value:
            raise serializers.ValidationError("Name is required.")
        return value

    def validate_designation(self, value):
        return value.strip()

    def validate_company(self, value):
        return value.strip()

    def validate_rating(self, value):
        if not 1 <= value <= 5:
            raise serializers.ValidationError("Rating must be between 1 and 5.")
        return value

    def validate_review(self, value):
        value = value.strip()
        if len(value) < REVIEW_MIN_LENGTH:
            raise serializers.ValidationError(f"Review must be at least {REVIEW_MIN_LENGTH} characters.")
        if len(value) > REVIEW_MAX_LENGTH:
            raise serializers.ValidationError(f"Review must be at most {REVIEW_MAX_LENGTH} characters.")
        return value


class PublicTestimonialSerializer(serializers.ModelSerializer):
    """What an anonymous visitor receives — display fields only. No
    customer email/id, no order, no moderation state (every row reaching
    this serializer is already APPROVED + active)."""

    class Meta:
        model = Testimonial
        fields = ["id", "profile_image", "name", "designation", "company", "rating", "review", "created_at"]
        read_only_fields = fields
