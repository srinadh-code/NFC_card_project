from django.contrib import admin

from .models import Order, OrderItem, OrderStatusHistory


class OrderItemInline(admin.TabularInline):
    model = OrderItem
    extra = 0


class OrderStatusHistoryInline(admin.TabularInline):
    model = OrderStatusHistory
    extra = 0
    readonly_fields = ["status", "note", "created_at"]
    can_delete = False


@admin.register(Order)
class OrderAdmin(admin.ModelAdmin):
    list_display = ["order_number", "user", "status", "total", "tracking_number", "created_at"]
    list_filter = ["status"]
    search_fields = ["order_number", "user__email", "tracking_number"]
    readonly_fields = ["order_number", "subtotal", "total", "created_at", "updated_at"]
    inlines = [OrderItemInline, OrderStatusHistoryInline]
