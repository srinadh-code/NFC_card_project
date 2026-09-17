from django.contrib import admin

from .models import Cart, CartItem


class CartItemInline(admin.TabularInline):
    model = CartItem
    extra = 0
    readonly_fields = ["created_at", "updated_at"]


@admin.register(Cart)
class CartAdmin(admin.ModelAdmin):
    list_display = ["id", "customer", "item_count", "updated_at"]
    search_fields = ["customer__email"]
    readonly_fields = ["created_at", "updated_at"]
    inlines = [CartItemInline]

    def item_count(self, obj):
        return obj.items.count()
