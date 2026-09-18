from django.conf import settings
from django.db import models


class Announcement(models.Model):
    """A single admin-authored broadcast — the smallest proper mechanism
    for "System Messages": an admin writes one of these, and it fans out to
    a Notification (type=SYSTEM_MESSAGE, still gated by each customer's own
    notify_system_messages preference via services.notify) for every
    customer at send time. Kept here, next to Notification/notify(), rather
    than as a new app, since sending one *is* just creating Notifications."""

    title = models.CharField(max_length=200)
    message = models.TextField(blank=True)
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True, related_name="+"
    )
    # How many customers actually got a Notification for this announcement
    # (i.e. had notify_system_messages on) — recorded at send time so the
    # admin list view doesn't need to reconstruct it from Notification rows
    # later, which would drift once a customer reads/deletes theirs.
    recipient_count = models.PositiveIntegerField(default=0)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at"]

    def __str__(self):
        return self.title


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
