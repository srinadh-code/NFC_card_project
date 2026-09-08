from django.contrib import admin

from .models import TapEvent


@admin.register(TapEvent)
class TapEventAdmin(admin.ModelAdmin):
    list_display = ["id", "action", "card", "customer", "device", "location", "created_at"]
    list_filter = ["action", "device"]
    search_fields = ["card__uid", "customer__email"]
    readonly_fields = ["created_at"]
