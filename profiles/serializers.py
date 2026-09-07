from rest_framework import serializers

from .models import CustomField, CustomLink, Profile, SocialLink


class SocialLinkSerializer(serializers.ModelSerializer):
    class Meta:
        model = SocialLink
        fields = ["id", "platform", "url", "enabled", "display_order"]
        read_only_fields = ["id"]


class CustomLinkSerializer(serializers.ModelSerializer):
    class Meta:
        model = CustomLink
        fields = ["id", "label", "url", "enabled", "display_order"]
        read_only_fields = ["id"]


class CustomFieldSerializer(serializers.ModelSerializer):
    class Meta:
        model = CustomField
        fields = ["id", "label", "value", "display_order"]
        read_only_fields = ["id"]


class ProfileSerializer(serializers.ModelSerializer):
    """Own profile — full detail, owner-only."""

    full_name = serializers.CharField(source="user.full_name", max_length=150)
    email = serializers.EmailField(source="user.email", read_only=True)
    phone = serializers.CharField(source="user.phone", max_length=20, required=False, allow_blank=True)
    avatar = serializers.SerializerMethodField()
    profile_url = serializers.SerializerMethodField()
    social_links = SocialLinkSerializer(many=True, read_only=True)
    custom_links = CustomLinkSerializer(many=True, read_only=True)
    custom_fields = CustomFieldSerializer(many=True, read_only=True)

    class Meta:
        model = Profile
        fields = [
            "id",
            "username",
            "full_name",
            "designation",
            "company",
            "email",
            "phone",
            "website",
            "address",
            "bio",
            "avatar",
            "profile_url",
            "status",
            "profile_public",
            "show_contact_info",
            "show_in_search",
            "social_links",
            "custom_links",
            "custom_fields",
            "created_at",
        ]
        read_only_fields = ["id", "username", "status", "created_at"]

    def get_avatar(self, obj):
        if obj.avatar:
            return obj.avatar.url
        return obj.user.avatar_url

    def get_profile_url(self, obj):
        request = self.context.get("request")
        path = obj.public_url_path
        return request.build_absolute_uri(path) if request else path

    def update(self, instance, validated_data):
        user_data = validated_data.pop("user", {})
        user = instance.user
        changed = []
        if "full_name" in user_data:
            user.full_name = user_data["full_name"]
            changed.append("full_name")
        if "phone" in user_data:
            user.phone = user_data["phone"]
            changed.append("phone")
        if changed:
            user.save(update_fields=changed)

        return super().update(instance, validated_data)


class PublicProfileSerializer(serializers.ModelSerializer):
    """
    Public, unauthenticated view of a profile. Only ever includes enabled
    links, and only includes contact info when the owner opted in via
    show_contact_info — never exposes internal ids beyond what's needed to
    render the page, passwords, tokens, or admin/account data.
    """

    full_name = serializers.CharField(source="user.full_name", read_only=True)
    email = serializers.SerializerMethodField()
    phone = serializers.SerializerMethodField()
    avatar = serializers.SerializerMethodField()
    cover_image = serializers.SerializerMethodField()
    social_links = serializers.SerializerMethodField()
    custom_links = serializers.SerializerMethodField()
    custom_fields = CustomFieldSerializer(many=True, read_only=True)
    services = serializers.SerializerMethodField()

    class Meta:
        model = Profile
        fields = [
            "username",
            "full_name",
            "designation",
            "company",
            "email",
            "phone",
            "website",
            "address",
            "city",
            "state",
            "country",
            "google_maps_url",
            "bio",
            "avatar",
            "cover_image",
            "social_links",
            "custom_links",
            "custom_fields",
            "services",
        ]

    def _absolute_url(self, url):
        request = self.context.get("request")
        return request.build_absolute_uri(url) if request else url

    def get_avatar(self, obj):
        if obj.avatar:
            return self._absolute_url(obj.avatar.url)
        return obj.user.avatar_url

    def get_cover_image(self, obj):
        if not obj.cover_image:
            return None
        return self._absolute_url(obj.cover_image.url)

    def get_email(self, obj):
        return obj.user.email if obj.show_contact_info else None

    def get_phone(self, obj):
        return obj.user.phone if obj.show_contact_info else None

    def get_social_links(self, obj):
        links = [link for link in obj.social_links.all() if link.enabled]
        return SocialLinkSerializer(links, many=True).data

    def get_custom_links(self, obj):
        links = [link for link in obj.custom_links.all() if link.enabled]
        return CustomLinkSerializer(links, many=True).data

    def get_services(self, obj):
        from customer_management.customer_services.models import CustomerService
        from customer_management.customer_services.serializers import CustomerServiceSerializer

        services = CustomerService.objects.filter(user=obj.user, is_active=True)
        return CustomerServiceSerializer(services, many=True).data
