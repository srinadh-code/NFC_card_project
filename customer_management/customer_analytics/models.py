from django.conf import settings
from django.db import models


class AnalyticsEvent(models.Model):
    class EventType(models.TextChoices):
        PROFILE_VIEW = "PROFILE_VIEW", "Profile View"
        NFC_TAP = "NFC_TAP", "NFC Tap"
        QR_SCAN = "QR_SCAN", "QR Scan"
        SOCIAL_CLICK = "SOCIAL_CLICK", "Social Link Click"

    user = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="analytics_events"
    )
    event_type = models.CharField(max_length=20, choices=EventType.choices, db_index=True)
    device = models.CharField(max_length=20, blank=True)
    ip_address = models.GenericIPAddressField(null=True, blank=True)
    source = models.CharField(max_length=50, blank=True)
    metadata = models.CharField(max_length=255, blank=True)
    created_at = models.DateTimeField(auto_now_add=True, db_index=True)

    class Meta:
        ordering = ["-created_at"]
        indexes = [models.Index(fields=["user", "event_type", "created_at"])]

    def __str__(self):
        return f"{self.event_type} / {self.user_id} @ {self.created_at:%Y-%m-%d %H:%M}"
