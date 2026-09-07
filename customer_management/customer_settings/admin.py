from django.contrib import admin

from .models import CustomerSettings


@admin.register(CustomerSettings)
class CustomerSettingsAdmin(admin.ModelAdmin):
    list_display = ["user", "language", "timezone", "show_email", "show_phone", "updated_at"]
    search_fields = ["user__email"]
    readonly_fields = ["created_at", "updated_at"]
