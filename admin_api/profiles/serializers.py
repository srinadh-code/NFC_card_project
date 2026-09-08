# Admin-facing digital-profile management. Distinct from admin_api.customers
# (which lists CUSTOMER Users) — this module treats profiles.Profile itself
# as the resource, matching the frontend's separate "Profiles" admin page
# (its own id space, profile link, activate/suspend action).
from rest_framework import serializers

from profiles.models import Profile
from profiles.serializers import SocialLinkSerializer


class AdminProfileSerializer(serializers.ModelSerializer):
    full_name = serializers.CharField(source="user.full_name", read_only=True)
    email = serializers.EmailField(source="user.email", read_only=True)
    phone = serializers.CharField(source="user.phone", read_only=True)
    avatar = serializers.SerializerMethodField()
    profile_link = serializers.SerializerMethodField()
    social_links = SocialLinkSerializer(many=True, read_only=True)

    class Meta:
        model = Profile
        fields = [
            "id",
            "full_name",
            "username",
            "designation",
            "company",
            "email",
            "phone",
            "bio",
            "avatar",
            "profile_link",
            "status",
            "social_links",
            "created_at",
        ]
        read_only_fields = fields

    def get_avatar(self, obj):
        if obj.avatar:
            return obj.avatar.url
        return obj.user.avatar_url

    def get_profile_link(self, obj):
        return obj.public_url_path


class AdminProfileUpdateSerializer(serializers.Serializer):
    """Admin editing someone else's profile — same writable fields as the
    customer's own ProfileSerializer, just not scoped to request.user."""

    full_name = serializers.CharField(source="user.full_name", max_length=150, required=False)
    designation = serializers.CharField(max_length=150, required=False, allow_blank=True)
    company = serializers.CharField(max_length=150, required=False, allow_blank=True)
    phone = serializers.CharField(source="user.phone", max_length=20, required=False, allow_blank=True)
    bio = serializers.CharField(required=False, allow_blank=True)

    def save(self, profile):
        data = self.validated_data
        user_data = data.pop("user", {})
        changed = []
        if "full_name" in user_data:
            profile.user.full_name = user_data["full_name"]
            changed.append("full_name")
        if "phone" in user_data:
            profile.user.phone = user_data["phone"]
            changed.append("phone")
        if changed:
            profile.user.save(update_fields=changed)

        profile_fields = []
        for field in ("designation", "company", "bio"):
            if field in data:
                setattr(profile, field, data[field])
                profile_fields.append(field)
        if profile_fields:
            profile.save(update_fields=[*profile_fields, "updated_at"])

        return profile
