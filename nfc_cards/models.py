import ipaddress
import re
from urllib.parse import quote, urlsplit

from django.conf import settings
from django.core import signing
from django.db import models


def _programming_origin():
    origin = getattr(settings, "PUBLIC_NFC_BASE_URL", "") or settings.FRONTEND_URL
    if not isinstance(origin, str) or any(ord(char) <= 32 or ord(char) == 127 or char == "\\" for char in origin):
        return None
    try:
        parsed = urlsplit(origin)
        host = parsed.hostname or ""
        if (
            parsed.scheme != "https" or parsed.username is not None or parsed.password is not None
            or parsed.port is not None or parsed.path not in ("", "/") or parsed.query or parsed.fragment
            or parsed.netloc.lower() != host or len(host) > 253
            or not re.fullmatch(r"(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}", host)
            or any(host == suffix or host.endswith("." + suffix) for suffix in ("localhost", "local", "internal", "lan", "home", "invalid", "test"))
        ):
            return None
        try:
            ipaddress.ip_address(host)
        except ValueError:
            return f"https://{host}"
    except ValueError:
        pass
    return None


def _review_signer():
    # Deterministic and non-expiring: editing business settings or restarting
    # a worker must never require rewriting a physical card. This is a public
    # routing identifier, separate from account authentication credentials.
    return signing.Signer(salt="nfc_cards.review.public.v1", sep=".", algorithm="sha256")


def review_uid_from_identifier(identifier):
    if not isinstance(identifier, str) or not 45 <= len(identifier) <= 76:
        return None
    try:
        uid = _review_signer().unsign(identifier)
    except signing.BadSignature:
        return None
    return uid if 1 <= len(uid) <= 32 else None


class NfcCard(models.Model):
    class CardType(models.TextChoices):
        # CLASSIC and PREMIUM are fully retired (removed from this enum by
        # migration nfc_cards.0005_delete_retired_card_types, which also
        # deletes any existing rows with those values). Review uses its
        # existing catalog/order identifier for physical inventory as well.
        WOODEN = "WOODEN", "Wooden"
        CUSTOM = "CUSTOM", "Custom"
        REVIEW = "REVIEW", "Google Review Card"

    class Status(models.TextChoices):
        ACTIVE = "ACTIVE", "Active"
        ASSIGNED = "ASSIGNED", "Assigned"
        INACTIVE = "INACTIVE", "Inactive"
        BLOCKED = "BLOCKED", "Blocked"
        LOST = "LOST", "Lost"
        UNASSIGNED = "UNASSIGNED", "Unassigned"

    uid = models.CharField(max_length=32, unique=True, db_index=True)
    serial_number = models.CharField(max_length=20, unique=True, db_index=True)
    card_type = models.CharField(max_length=10, choices=CardType.choices, default=CardType.CUSTOM)
    color = models.CharField(max_length=30, default="Black")

    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="nfc_cards",
    )
    status = models.CharField(max_length=10, choices=Status.choices, default=Status.UNASSIGNED)

    assigned_on = models.DateTimeField(null=True, blank=True)
    activated_on = models.DateTimeField(null=True, blank=True)
    purchase_date = models.DateField(null=True, blank=True)
    notes = models.TextField(blank=True)

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-created_at"]

    def __str__(self):
        return f"{self.serial_number} ({self.uid})"

    @property
    def programming_url(self):
        """Permanent public URL for an owned Review card, even before setup.

        A purpose-bound signature makes even manually chosen card UIDs
        unguessable as programming identifiers. It is derived without writing
        or changing the existing UID; business edits never change this link.
        """
        if self.card_type != self.CardType.REVIEW or self.user_id is None or self.status == self.Status.UNASSIGNED:
            return None
        origin = _programming_origin()
        identifier = _review_signer().sign(self.uid)
        return f"{origin}/nfc/{quote(identifier, safe='')}" if origin else None

    @classmethod
    def generate_serial_number(cls):
        last = cls.objects.order_by("-id").first()
        next_n = (last.id if last else 0) + 1
        candidate = f"SN{next_n:06d}"
        while cls.objects.filter(serial_number=candidate).exists():
            next_n += 1
            candidate = f"SN{next_n:06d}"
        return candidate
