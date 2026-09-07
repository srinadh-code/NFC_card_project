from rest_framework import serializers

from .models import CustomerSettings


class CustomerSettingsSerializer(serializers.ModelSerializer):
    class Meta:
        model = CustomerSettings
        fields = [
            "id",
            "show_email",
            "show_phone",
            "show_company",
            "show_social_links",
            "language",
            "timezone",
            "notify_order_updates",
            "notify_nfc_updates",
            "notify_profile_views",
            "notify_system_messages",
            "updated_at",
        ]
        read_only_fields = ["id", "updated_at"]
