from django.contrib import admin

from .models import Testimonial


@admin.register(Testimonial)
class TestimonialAdmin(admin.ModelAdmin):
    list_display = ["name", "customer", "rating", "status", "is_active", "created_at"]
    list_filter = ["status", "is_active", "rating"]
    search_fields = ["name", "company", "customer__email", "customer__full_name", "review"]
    readonly_fields = ["customer", "order", "profile_image", "profile_image_public_id", "created_at", "updated_at"]
