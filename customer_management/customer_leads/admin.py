from django.contrib import admin

from .models import Lead


@admin.register(Lead)
class LeadAdmin(admin.ModelAdmin):
    list_display = ["name", "user", "email", "phone", "company", "status", "created_at"]
    list_filter = ["status"]
    search_fields = ["name", "email", "phone", "company", "user__email"]
    readonly_fields = ["created_at"]
