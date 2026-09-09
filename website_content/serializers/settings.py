from rest_framework import serializers

from website_content.models import GeneralSettings


class GeneralSettingsSerializer(serializers.ModelSerializer):
    """Admin read/write — includes bookkeeping fields."""

    class Meta:
        model = GeneralSettings
        fields = [
            "id",
            "site_name",
            "site_email",
            "site_phone",
            "site_address",
            "currency",
            "timezone",
            "updated_at",
        ]
        read_only_fields = ["id", "updated_at"]


class PublicGeneralSettingsSerializer(serializers.ModelSerializer):
    """Public read-only — only the fields the public website is allowed to see.

    Deliberately excludes id/timestamps/is_active; GeneralSettings itself
    never holds credentials or secrets, but this keeps the public payload
    scoped to exactly what the spec calls for.
    """

    class Meta:
        model = GeneralSettings
        fields = [
            "site_name",
            "site_email",
            "site_phone",
            "site_address",
            "currency",
            "timezone",
        ]
