from django.db import models


class GeneralSettings(models.Model):
    """Singleton — site-wide public configuration (Admin Settings > General).

    Single source of truth for branding/contact info shown on the public
    website. The admin UI edits this row; the public site only ever reads it
    through the read-only public endpoint (see website_content/views/public.py).
    """

    class Currency(models.TextChoices):
        INR = "INR", "INR - Indian Rupee"
        USD = "USD", "USD - US Dollar"
        EUR = "EUR", "EUR - Euro"

    site_name = models.CharField(max_length=150, blank=True, default="")
    site_email = models.EmailField(blank=True, default="")
    site_phone = models.CharField(max_length=30, blank=True, default="")
    site_address = models.CharField(max_length=255, blank=True, default="")
    currency = models.CharField(max_length=10, choices=Currency.choices, default=Currency.INR)
    # Free-form IANA timezone name (e.g. "Asia/Kolkata") rather than a fixed
    # choices list — same convention as CustomerSettings.timezone.
    timezone = models.CharField(max_length=50, default="Asia/Kolkata")

    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = "General Settings"
        verbose_name_plural = "General Settings"

    def __str__(self):
        return self.site_name or "General Settings"
