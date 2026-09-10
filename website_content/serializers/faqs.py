from rest_framework import serializers

from website_content.models import Faq


class FaqSerializer(serializers.ModelSerializer):
    class Meta:
        model = Faq
        fields = ["id", "question", "answer", "display_order", "is_active"]
