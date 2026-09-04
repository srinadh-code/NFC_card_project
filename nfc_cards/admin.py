from django.contrib import admin

from .models import NfcCard


@admin.register(NfcCard)
class NfcCardAdmin(admin.ModelAdmin):
    list_display = ["serial_number", "uid", "card_type", "status", "user", "activated_on"]
    list_filter = ["status", "card_type"]
    search_fields = ["uid", "serial_number", "user__email", "user__full_name"]
    readonly_fields = ["created_at", "updated_at"]
