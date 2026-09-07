from django.conf import settings
from django.db import models


class CustomerService(models.Model):
    """A service a customer showcases on their public profile (e.g. "Web Development")."""

    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="services")
    title = models.CharField(max_length=150)
    description = models.CharField(max_length=500, blank=True)
    display_order = models.PositiveIntegerField(default=0)
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["display_order", "id"]

    def __str__(self):
        return f"{self.title} ({self.user.email})"
