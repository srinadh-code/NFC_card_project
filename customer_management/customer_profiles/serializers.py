from rest_framework import serializers

from profiles.models import Profile


class CustomerProfileSerializer(serializers.ModelSerializer):
    """Full read/write shape of a customer's own profile."""

    full_name = serializers.CharField(source="user.full_name", max_length=150, required=False, allow_blank=True)
    email = serializers.EmailField(source="user.email", read_only=True)
    phone = serializers.CharField(
        source="user.phone", max_length=20, required=False, allow_blank=True
    )
    company_name = serializers.CharField(source="company", max_length=150, required=False, allow_blank=True)
    profile_image = serializers.SerializerMethodField()
    cover_image = serializers.SerializerMethodField()
    profile_url = serializers.SerializerMethodField()

    class Meta:
        model = Profile
        fields = [
            "id",
            "username",
            "full_name",
            "designation",
            "company_name",
            "phone",
            "alternate_phone",
            "email",
            "bio",
            "address",
            "city",
            "state",
            "country",
            "google_maps_url",
            "profile_image",
            "cover_image",
            "profile_url",
            "status",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["id", "username", "status", "created_at", "updated_at"]

    def get_profile_image(self, obj):
        if obj.avatar:
            request = self.context.get("request")
            url = obj.avatar.url
            return request.build_absolute_uri(url) if request else url
        return obj.user.avatar_url

    def get_cover_image(self, obj):
        if not obj.cover_image:
            return None
        request = self.context.get("request")
        url = obj.cover_image.url
        return request.build_absolute_uri(url) if request else url

    def get_profile_url(self, obj):
        request = self.context.get("request")
        path = obj.public_url_path
        return request.build_absolute_uri(path) if request else path

    def update(self, instance, validated_data):
        user_data = validated_data.pop("user", {})
        user = instance.user
        changed_user_fields = []
        if "full_name" in user_data:
            user.full_name = user_data["full_name"]
            changed_user_fields.append("full_name")
        if "phone" in user_data:
            user.phone = user_data["phone"]
            changed_user_fields.append("phone")
        if changed_user_fields:
            user.save(update_fields=changed_user_fields)

        return super().update(instance, validated_data)
