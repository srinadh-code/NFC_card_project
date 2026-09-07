from django.contrib import admin

from .models import CustomerQrCode


@admin.register(CustomerQrCode)
class CustomerQrCodeAdmin(admin.ModelAdmin):
    list_display = ["profile", "target_url", "created_at", "updated_at"]
    search_fields = ["profile__username", "profile__user__email"]
    readonly_fields = ["created_at", "updated_at"]
