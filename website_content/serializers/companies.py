from rest_framework import serializers

from website_content.models import Company


class CompanySerializer(serializers.ModelSerializer):
    logo_url = serializers.CharField(read_only=True)

    class Meta:
        model = Company
        fields = ["id", "name", "logo_url", "display_order", "is_active"]
