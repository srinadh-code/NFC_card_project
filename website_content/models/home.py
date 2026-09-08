from django.db import models


class HomeHero(models.Model):
    """Singleton — the Home page hero section. Keep only one row."""

    badge = models.CharField(max_length=150, blank=True, default="")
    heading = models.CharField(max_length=255, blank=True, default="")
    description = models.TextField(blank=True, default="")

    primary_cta_text = models.CharField(max_length=100, blank=True, default="")
    primary_cta_link = models.CharField(max_length=255, blank=True, default="")
    secondary_cta_text = models.CharField(max_length=100, blank=True, default="")
    secondary_cta_link = models.CharField(max_length=255, blank=True, default="")

    hero_image_url = models.URLField(max_length=500, blank=True, default="")
    hero_image_public_id = models.CharField(max_length=255, blank=True, default="")

    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = "Home Hero"
        verbose_name_plural = "Home Hero"

    def __str__(self):
        return self.heading or "Home Hero"


class HomeHeroFeatureHighlight(models.Model):
    """Small checklist under the Home hero copy, e.g. 'NFC & QR Code'."""

    icon = models.CharField(max_length=50, help_text="Lucide icon name, e.g. Zap")
    label = models.CharField(max_length=150)
    display_order = models.PositiveIntegerField(default=0)
    is_active = models.BooleanField(default=True)

    class Meta:
        ordering = ["display_order", "id"]
        verbose_name = "Home Hero Feature Highlight"

    def __str__(self):
        return self.label


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
