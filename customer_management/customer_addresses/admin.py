from django.contrib import admin

from .models import CustomerAddress


@admin.register(CustomerAddress)
class CustomerAddressAdmin(admin.ModelAdmin):
    list_display = ["label", "customer", "city", "state", "pincode", "is_default", "created_at"]
    list_filter = ["is_default", "state"]
    search_fields = ["label", "customer__email", "city", "pincode"]
    readonly_fields = ["created_at", "updated_at"]
