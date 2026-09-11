from django.db import models


class HomeHero(models.Model):
    """Singleton — the Home page hero section. Keep only one row."""

    badge = models.CharField(max_length=150, blank=True, default="")
    heading_line1 = models.CharField(max_length=255, blank=True, default="")
    heading_line2 = models.CharField(
        max_length=255,
        blank=True,
        default="",
        help_text="Rendered on its own line, in the brand gradient (e.g. 'with a Single Tap').",
    )
    description = models.TextField(blank=True, default="")

    primary_cta_text = models.CharField(max_length=100, blank=True, default="")
    primary_cta_link = models.CharField(max_length=255, blank=True, default="")
    secondary_cta_text = models.CharField(max_length=100, blank=True, default="")
    secondary_cta_link = models.CharField(max_length=255, blank=True, default="")

    # Two independent hero visuals — the phone mockup screenshot and the NFC
    # card rendered behind/beside it — each swappable by the admin without
    # touching the other.
    phone_image_url = models.URLField(max_length=500, blank=True, default="")
    phone_image_public_id = models.CharField(max_length=255, blank=True, default="")
    nfc_card_image_url = models.URLField(max_length=500, blank=True, default="")
    nfc_card_image_public_id = models.CharField(max_length=255, blank=True, default="")

    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = "Home Hero"
        verbose_name_plural = "Home Hero"

    def __str__(self):
        return self.heading_line1 or "Home Hero"


class HomeHeroFeatureHighlight(models.Model):
    """The 4 feature callouts under the Home hero buttons, e.g.
    'Instant Sharing' / 'NFC & QR Enabled'."""

    icon = models.CharField(max_length=50, help_text="Lucide icon name, e.g. Zap")
    label = models.CharField(max_length=150)
    description = models.CharField(max_length=255, blank=True, default="")
    display_order = models.PositiveIntegerField(default=0)
    is_active = models.BooleanField(default=True)

    class Meta:
        ordering = ["display_order", "id"]
        verbose_name = "Home Hero Feature Highlight"

    def __str__(self):
        return self.label


class HomeBottomBarItem(models.Model):
    """Row in the glassmorphism info strip beneath the Home hero, e.g.
    'One Card' / 'Endless Opportunities'."""

    icon = models.CharField(
        max_length=50,
        blank=True,
        default="",
        help_text="Lucide icon name. Leave blank for the first item to show the customer avatar stack instead.",
    )
    title = models.CharField(max_length=150)
    description = models.CharField(max_length=255, blank=True, default="")
    display_order = models.PositiveIntegerField(default=0)
    is_active = models.BooleanField(default=True)

    class Meta:
        ordering = ["display_order", "id"]
        verbose_name = "Home Bottom Bar Item"

    def __str__(self):
        return self.title


class HomeHowItFeels(models.Model):
    """Singleton — the 'How It Feels' section (NfcShowcase)."""

    badge = models.CharField(max_length=150, blank=True, default="")
    heading = models.CharField(max_length=255, blank=True, default="")
    description = models.TextField(blank=True, default="")
    is_active = models.BooleanField(default=True)

    class Meta:
        verbose_name = "Home How It Feels"
        verbose_name_plural = "Home How It Feels"

    def __str__(self):
        return self.heading or "How It Feels"


class HomeHowItFeelsPoint(models.Model):
    """Points listed under 'How It Feels', e.g. 'Instant Sharing'."""

    icon = models.CharField(max_length=50, help_text="Lucide icon name")
    text = models.CharField(max_length=255)
    display_order = models.PositiveIntegerField(default=0)
    is_active = models.BooleanField(default=True)

    class Meta:
        ordering = ["display_order", "id"]
        verbose_name = "Home How It Feels Point"

    def __str__(self):
        return self.text


class HomeCTA(models.Model):
    """Singleton — the bottom 'Still have questions?' CTA banner."""

    heading = models.CharField(max_length=255, blank=True, default="")
    description = models.TextField(blank=True, default="")
    button_text = models.CharField(max_length=100, blank=True, default="")
    button_link = models.CharField(max_length=255, blank=True, default="")
    is_active = models.BooleanField(default=True)

    class Meta:
        verbose_name = "Home CTA"
        verbose_name_plural = "Home CTA"

    def __str__(self):
        return self.heading or "Home CTA"
