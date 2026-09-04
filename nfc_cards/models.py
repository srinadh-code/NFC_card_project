from django.conf import settings
from django.db import models


class NfcCard(models.Model):
    class CardType(models.TextChoices):
        STANDARD = "STANDARD", "Standard"
        PREMIUM = "PREMIUM", "Premium"
        WOODEN = "WOODEN", "Wooden"
        METAL = "METAL", "Metal"

    class Status(models.TextChoices):
        ACTIVE = "ACTIVE", "Active"
        ASSIGNED = "ASSIGNED", "Assigned"
        INACTIVE = "INACTIVE", "Inactive"
        BLOCKED = "BLOCKED", "Blocked"
        LOST = "LOST", "Lost"
        UNASSIGNED = "UNASSIGNED", "Unassigned"

    uid = models.CharField(max_length=32, unique=True, db_index=True)
    serial_number = models.CharField(max_length=20, unique=True, db_index=True)
    card_type = models.CharField(max_length=10, choices=CardType.choices, default=CardType.STANDARD)
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

    @classmethod
    def generate_serial_number(cls):
        last = cls.objects.order_by("-id").first()
        next_n = (last.id if last else 0) + 1
        candidate = f"SN{next_n:06d}"
        while cls.objects.filter(serial_number=candidate).exists():
            next_n += 1
            candidate = f"SN{next_n:06d}"
        return candidate
