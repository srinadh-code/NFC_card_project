from django.contrib import admin

from .models import SupportTicket, TicketMessage


class TicketMessageInline(admin.TabularInline):
    model = TicketMessage
    extra = 0


@admin.register(SupportTicket)
class SupportTicketAdmin(admin.ModelAdmin):
    list_display = ["id", "subject", "customer", "priority", "status", "created_at"]
    list_filter = ["status", "priority"]
    search_fields = ["subject", "customer__email", "customer__full_name"]
    readonly_fields = ["created_at", "updated_at"]
    inlines = [TicketMessageInline]
