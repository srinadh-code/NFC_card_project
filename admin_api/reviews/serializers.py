# Admin-facing review serializers. Operate on reviews.Review joined to its
# accounts.User — same "no separate admin-only model" shape as
# admin_api/customers (which reads profiles.Profile) and admin_api/orders
# (which reads orders.Order): admin sees the exact same rows the customer
# and public APIs read from, never a duplicate.
from rest_framework import serializers

from reviews.models import Review


class AdminReviewListSerializer(serializers.ModelSerializer):
    customer_name = serializers.CharField(source="user.full_name", read_only=True)
    customer_email = serializers.EmailField(source="user.email", read_only=True)

    class Meta:
        model = Review
        fields = [
            "id",
            "customer_name",
            "customer_email",
            "rating",
            "review_text",
            "is_published",
            "created_at",
            "updated_at",
        ]
        read_only_fields = fields


class AdminReviewStatusSerializer(serializers.Serializer):
    is_published = serializers.BooleanField()
