from django.contrib import admin

from .models import NfcCard


@admin.register(NfcCard)
class NfcCardAdmin(admin.ModelAdmin):
    list_display = ["serial_number", "uid", "card_type", "status", "user", "activated_on"]
    list_filter = ["status", "card_type"]
    search_fields = ["uid", "serial_number", "user__email", "user__full_name"]
    readonly_fields = ["created_at", "updated_at"]

    def get_readonly_fields(self, request, obj=None):
        fields = super().get_readonly_fields(request, obj)
        if obj and obj.card_type == NfcCard.CardType.REVIEW and (obj.user_id or obj.assigned_on):
            return [*fields, "uid", "card_type"]
        return fields
