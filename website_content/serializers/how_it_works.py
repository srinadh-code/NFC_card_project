from rest_framework import serializers

from website_content.models import HowItWorksStep


class HowItWorksStepSerializer(serializers.ModelSerializer):
    class Meta:
        model = HowItWorksStep
        fields = ["id", "step_number", "icon", "title", "description", "display_order", "is_active"]
