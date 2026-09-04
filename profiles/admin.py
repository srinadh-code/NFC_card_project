from django.contrib import admin

from .models import CustomField, CustomLink, Profile, SocialLink


class SocialLinkInline(admin.TabularInline):
    model = SocialLink
    extra = 0


class CustomLinkInline(admin.TabularInline):
    model = CustomLink
    extra = 0


class CustomFieldInline(admin.TabularInline):
    model = CustomField
    extra = 0


@admin.register(Profile)
class ProfileAdmin(admin.ModelAdmin):
    list_display = ["username", "user", "status", "profile_public", "created_at"]
    list_filter = ["status", "profile_public"]
    search_fields = ["username", "user__email", "user__full_name"]
    readonly_fields = ["created_at", "updated_at"]
    inlines = [SocialLinkInline, CustomLinkInline, CustomFieldInline]
