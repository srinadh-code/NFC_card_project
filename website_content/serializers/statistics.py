from rest_framework import serializers

from website_content.models import Statistic


class StatisticSerializer(serializers.ModelSerializer):
    class Meta:
        model = Statistic
        fields = ["id", "page", "value", "label", "icon", "display_order", "is_active"]
