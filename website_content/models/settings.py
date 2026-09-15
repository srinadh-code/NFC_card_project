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


class PaymentSettings(models.Model):
    """Singleton — Admin Settings > Payment. `razorpay_secret` is write-only
    at the serializer layer (never returned by the read endpoint) — same
    "never expose a credential you accept" convention used for passwords
    elsewhere in this codebase. No live Razorpay integration reads this yet;
    it exists so the admin's configured values are real, persisted data
    instead of a client-only mock."""

    razorpay_key_id = models.CharField(max_length=100, blank=True, default="")
    razorpay_secret = models.CharField(max_length=200, blank=True, default="")
    cod_enabled = models.BooleanField(default=True)

    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = "Payment Settings"
        verbose_name_plural = "Payment Settings"

    def __str__(self):
        return "Payment Settings"


class ShippingSettings(models.Model):
    """Singleton — Admin Settings > Shipping."""

    flat_rate = models.DecimalField(max_digits=10, decimal_places=2, default=0)
    free_shipping_threshold = models.DecimalField(max_digits=10, decimal_places=2, default=0)

    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = "Shipping Settings"
        verbose_name_plural = "Shipping Settings"

    def __str__(self):
        return "Shipping Settings"


class EmailSettings(models.Model):
    """Singleton — Admin Settings > Email. When `smtp_host` is set, real
    outgoing mail (see accounts/emails.py) opens its connection with these
    values instead of the server's env-configured SMTP_* settings — this is
    live configuration, not a display-only mock. SMTP auth credentials stay
    env-only (EMAIL_HOST_USER/EMAIL_HOST_PASSWORD), matching the same
    "credentials never live in an admin-editable row" rule as PaymentSettings."""

    smtp_host = models.CharField(max_length=255, blank=True, default="")
    smtp_port = models.PositiveIntegerField(null=True, blank=True)
    from_address = models.EmailField(blank=True, default="")

    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = "Email Settings"
        verbose_name_plural = "Email Settings"

    def __str__(self):
        return "Email Settings"


class SecuritySettings(models.Model):
    """Singleton — Admin Settings > Security. Every field here is actually
    enforced, not just stored: `access_token_minutes` overrides the JWT
    access-token lifetime at issuance (see accounts.views._issue_tokens);
    `min_password_length`/`require_special_char` are checked alongside
    Django's own validators on every password set/change/reset (see
    accounts.security). A full 2FA system is a separate, much larger
    feature and deliberately isn't represented here — there is no toggle
    for something that doesn't work yet."""

    access_token_minutes = models.PositiveIntegerField(
        default=30, help_text="JWT access token lifetime in minutes."
    )
    min_password_length = models.PositiveIntegerField(default=8)
    require_special_char = models.BooleanField(default=False)

    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = "Security Settings"
        verbose_name_plural = "Security Settings"

    def __str__(self):
        return "Security Settings"
