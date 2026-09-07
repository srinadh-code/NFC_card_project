from django.contrib import admin

from .models import Order, OrderItem, Transaction


class OrderItemInline(admin.TabularInline):
    model = OrderItem
    extra = 0


class TransactionInline(admin.TabularInline):
    model = Transaction
    extra = 0


@admin.register(Order)
class OrderAdmin(admin.ModelAdmin):
    list_display = ["id", "customer", "status", "payment_status", "amount", "placed_at"]
    list_filter = ["status", "payment_status", "payment_method"]
    search_fields = ["id", "customer__email", "customer__full_name"]
    readonly_fields = ["placed_at", "updated_at"]
    inlines = [OrderItemInline, TransactionInline]


@admin.register(Transaction)
class TransactionAdmin(admin.ModelAdmin):
    list_display = ["id", "order", "amount", "method", "status", "created_at"]
    list_filter = ["method", "status"]
    search_fields = ["id", "order__id"]
    readonly_fields = ["created_at"]
