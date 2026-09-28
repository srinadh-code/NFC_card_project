# Admin-facing testimonial serializer. Reads testimonials.Testimonial joined
# to its customer and order — the same rows the customer and public APIs
# use, never a duplicate admin-only copy.
from rest_framework import serializers

from testimonials.models import Testimonial


class AdminTestimonialSerializer(serializers.ModelSerializer):
    customer_id = serializers.IntegerField(source="customer.id", read_only=True)
    customer_name = serializers.CharField(source="customer.full_name", read_only=True)
    customer_email = serializers.EmailField(source="customer.email", read_only=True)
    order_number = serializers.CharField(source="order.order_number", read_only=True, default=None)

    class Meta:
        model = Testimonial
        fields = [
            "id",
            "customer_id",
            "customer_name",
            "customer_email",
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
            "created_at",
            "updated_at",
        ]
        read_only_fields = fields
