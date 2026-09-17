from rest_framework import serializers

from .models import Review


class ReviewSerializer(serializers.ModelSerializer):
    """The customer's own view of their review — GET/POST/PATCH
    /api/reviews/me/ all return this shape. `is_published` is included
    read-only so the customer can see their own moderation status (PART 9's
    "Status: Published / Not Published"), never write it — only an admin
    can flip that (see admin_api/reviews)."""

    class Meta:
        model = Review
        fields = ["id", "rating", "review_text", "is_published", "created_at", "updated_at"]
        read_only_fields = ["id", "is_published", "created_at", "updated_at"]

    def validate_rating(self, value):
        if not 1 <= value <= 5:
            raise serializers.ValidationError("Rating must be between 1 and 5.")
        return value

    def validate_review_text(self, value):
        value = value.strip()
        if len(value) < 10:
            raise serializers.ValidationError("Review must be at least 10 characters.")
        if len(value) > 500:
            raise serializers.ValidationError("Review must be at most 500 characters.")
        return value


class PublicReviewSerializer(serializers.ModelSerializer):
    """What the public website actually receives — only what's safe to show
    an anonymous visitor. No email, no internal id relationships, no
    moderation status (every row this serializer ever sees is already
    filtered to is_published=True by PublicReviewsAPIView, so the field
    would be redundant anyway)."""

    customer_name = serializers.CharField(source="user.full_name", read_only=True)

    class Meta:
        model = Review
        fields = ["id", "customer_name", "rating", "review_text", "created_at"]
        read_only_fields = fields
