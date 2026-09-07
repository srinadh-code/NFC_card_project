from django.contrib import admin

from .models import AnalyticsEvent


@admin.register(AnalyticsEvent)
class AnalyticsEventAdmin(admin.ModelAdmin):
    list_display = ["user", "event_type", "device", "source", "ip_address", "created_at"]
    list_filter = ["event_type", "device"]
    search_fields = ["user__email", "source", "metadata"]
    readonly_fields = ["created_at"]
