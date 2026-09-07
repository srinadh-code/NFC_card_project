from django.conf import settings
from django.db import models


class TapEvent(models.Model):
    """One real, logged engagement event. Rows are created by the actual
    public endpoints they describe (see nfc_cards.views.CardResolveView,
    nfc_cards.views.TrackEventView, profiles.views.PublicProfileView) —
    never backfilled or fabricated. Until those endpoints are hit by real
    traffic this table is legitimately empty."""

    class Action(models.TextChoices):
        TAP = "TAP", "Card Tapped"
        QR_SCAN = "QR_SCAN", "QR Code Scanned"
        PROFILE_VIEW = "PROFILE_VIEW", "Profile Viewed"
        CONTACT_SAVED = "CONTACT_SAVED", "Contact Saved"
        SHARED = "SHARED", "Shared"

    class Device(models.TextChoices):
        ANDROID = "ANDROID", "Android"
        IOS = "IOS", "iOS"
        OTHER = "OTHER", "Other"

    # Nullable: a resolve against an unknown/inactive UID still happens, but
    # isn't attributable to a real card/customer.
    card = models.ForeignKey(
        "nfc_cards.NfcCard", on_delete=models.SET_NULL, null=True, blank=True, related_name="tap_events"
    )
    customer = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="tap_events",
    )
    action = models.CharField(max_length=15, choices=Action.choices)
    device = models.CharField(max_length=10, choices=Device.choices, default=Device.OTHER)

    # No GeoIP service is integrated yet, so this is always null today — see
    # the "remaining dependencies" note in the admin analytics module.
    location = models.CharField(max_length=100, null=True, blank=True)

    # Privacy-preserving approximate-visitor signal: a salted one-way hash of
    # (IP + User-Agent), never the raw IP. Lets "unique visitors" be counted
    # via COUNT(DISTINCT visitor_hash) without storing anything identifying.
    visitor_hash = models.CharField(max_length=64, db_index=True)

    created_at = models.DateTimeField(auto_now_add=True, db_index=True)

    class Meta:
        ordering = ["-created_at"]

    def __str__(self):
        return f"{self.action} @ {self.created_at:%Y-%m-%d %H:%M}"
