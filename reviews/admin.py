from django.contrib import admin

from .models import Review


@admin.register(Review)
class ReviewAdmin(admin.ModelAdmin):
    list_display = ["user", "rating", "is_published", "created_at", "updated_at"]
    list_filter = ["is_published", "rating"]
    search_fields = ["user__email", "user__full_name", "review_text"]
    readonly_fields = ["created_at", "updated_at"]
