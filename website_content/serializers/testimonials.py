from rest_framework import serializers

from website_content.models import Testimonial


class TestimonialSerializer(serializers.ModelSerializer):
    image_url = serializers.CharField(read_only=True)

    class Meta:
        model = Testimonial
        fields = [
            "id",
            "name",
            "designation",
            "company",
            "review",
            "rating",
            "image_url",
            "display_order",
            "is_active",
        ]
