from django.conf import settings
from django.db import models


class Notification(models.Model):
    class Type(models.TextChoices):
        ORDER_UPDATE = "ORDER_UPDATE", "Order Updates"
        NFC_UPDATE = "NFC_UPDATE", "NFC Updates"
        PROFILE_VIEW = "PROFILE_VIEW", "Profile Views"
        SYSTEM_MESSAGE = "SYSTEM_MESSAGE", "System Messages"

    user = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="notifications"
    )
    title = models.CharField(max_length=200)
    message = models.TextField(blank=True)
    type = models.CharField(max_length=20, choices=Type.choices, default=Type.SYSTEM_MESSAGE)
    is_read = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at"]

    def __str__(self):
        return f"{self.title} -> {self.user_id}"
