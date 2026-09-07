from django.contrib import admin

from .models import CustomerService


@admin.register(CustomerService)
class CustomerServiceAdmin(admin.ModelAdmin):
    list_display = ["title", "user", "is_active", "display_order", "created_at"]
    list_filter = ["is_active"]
    search_fields = ["title", "user__email"]
    readonly_fields = ["created_at", "updated_at"]
