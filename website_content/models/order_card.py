from django.db import models

from common.templates import TEMPLATE_CHOICES


class OrderCardPageSettings(models.Model):
    """Singleton — the /shop ("Order Card") page's header and the
    "Choose Your Profile Theme" section's own heading/subtitle. The theme
    *mockups themselves* (ProfileThemeShowcase) stay code-rendered and out
    of scope here — this only covers the page's admin-editable marketing
    copy, matching every other page's CMS split in this project."""

    page_title = models.CharField(max_length=200, blank=True, default="")
    page_subtitle = models.TextField(blank=True, default="")

    theme_section_heading = models.CharField(max_length=200, blank=True, default="")
    theme_section_subtitle = models.TextField(blank=True, default="")

    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = "Order Card Page Settings"
        verbose_name_plural = "Order Card Page Settings"

    def __str__(self):
        return self.page_title or "Order Card Page Settings"


class OrderCardProduct(models.Model):
    """One purchasable tile on the Order Card page (e.g. "NEXORA Custom",
    "Google Review Card"). Replaces the frontend's formerly-hardcoded
    NEXORA_CARD_TYPES array as the real source of truth.

    `card_type` intentionally mirrors orders.serializers.
    ORDER_ITEM_CARD_TYPE_CHOICES (NfcCard.CardType + a "REVIEW" carve-out)
    as a local, duplicated choices list rather than an import — orders/
    nfc_cards and website_content don't currently depend on each other in
    either direction, and OrderItem.card_type itself is already a plain
    snapshot CharField with no model-level FK to any catalog (see
    orders/models.py). Keeping this list in sync with that one by hand,
    the same way the rest of this project treats order snapshots, is
    consistent with that existing design rather than introducing a new
    cross-app coupling for it.

    `slug` is a stable, human-chosen identifier (not the DB pk) used for:
    the frontend's per-product React state key, the "PRD-NEXORA-<SLUG>"
    product id sent with an order line, and as the lookup key into the
    frontend's CARD_THEME_IDS map (which stays a frontend-only concern —
    see the module docstring in data/constants.ts — so a product's slug
    must keep matching whatever key that map uses for template
    entitlement to keep working, e.g. "custom").
    """

    class CardType(models.TextChoices):
        WOODEN = "WOODEN", "Wooden"
        CUSTOM = "CUSTOM", "Custom"
        REVIEW = "REVIEW", "Google Review Card"

    class CardTone(models.TextChoices):
        FRONT = "front", "Front (brand gradient)"
        BACK = "back", "Back"
        GOLD = "gold", "Gold"
        CUSTOM = "custom", "Custom (multi-hue)"

    slug = models.SlugField(max_length=50, unique=True)
    name = models.CharField(max_length=150)
    price = models.DecimalField(max_digits=10, decimal_places=2)
    design = models.CharField(max_length=255, blank=True, default="")
    best_for = models.CharField(max_length=150, blank=True, default="")

    # Blank/0 means "no profile-template entitlement" (e.g. Google Review
    # Card) — the frontend hides the template-count UI entirely rather than
    # showing "0 Templates", same as before this was admin-editable.
    template_count = models.PositiveIntegerField(null=True, blank=True)

    # One feature bullet per line — a plain list of ~5-9 short strings never
    # needed its own reorderable child-collection UI anywhere else in this
    # project, so a newline-separated TextField (Textarea in the admin) is
    # the simplest option that's still fully admin-editable, rather than
    # introducing this project's first per-parent-row nested CRUD collection
    # for a handful of short bullet lines.
    features = models.TextField(blank=True, default="", help_text="One feature per line")

    card_type = models.CharField(max_length=10, choices=CardType.choices)
    # Used only when no image is uploaded — see image_url below.
    card_tone = models.CharField(max_length=10, choices=CardTone.choices, blank=True, default="")

    image_url = models.URLField(max_length=500, blank=True, default="")
    image_public_id = models.CharField(max_length=255, blank=True, default="")
    # Shown under the showcase image. Blank means the frontend falls back to
    # "Every {name} ships in this finish: {design}", same default as before.
    image_caption = models.CharField(max_length=255, blank=True, default="")

    color_name = models.CharField(max_length=50, blank=True, default="")
    color_hex = models.CharField(max_length=7, blank=True, default="")

    # Explains the theme *choice* for this product on the Profile Theme
    # section — blank for a product with no template entitlement, which
    # hides that whole section instead of showing empty copy.
    theme_plan_copy = models.TextField(blank=True, default="")

    popular = models.BooleanField(default=False)
    display_order = models.PositiveIntegerField(default=0)
    is_active = models.BooleanField(default=True)

    class Meta:
        ordering = ["display_order", "id"]
        verbose_name = "Order Card Product"

    def __str__(self):
        return self.name


class OrderCardTrustBadge(models.Model):
    """One badge in the "Free Shipping / 7 Days Return / Secure Payment /
    1 Year Warranty" strip under the configurator."""

    icon = models.CharField(max_length=50, help_text="Lucide icon name")
    label = models.CharField(max_length=100)
    display_order = models.PositiveIntegerField(default=0)
    is_active = models.BooleanField(default=True)

    class Meta:
        ordering = ["display_order", "id"]
        verbose_name = "Order Card Trust Badge"

    def __str__(self):
        return self.label


class ProfileTemplatePreview(models.Model):
    """Admin-uploaded image override for one of the 9 registered profile
    templates, shown on the /shop "Choose Your Profile Theme" grid in place
    of the code-drawn mockup (ProfileThemeShowcase.MOCKUPS) when active.
    Which ids are actually *eligible* to appear on /shop is unrelated and
    stays governed by the frontend's CARD_THEME_IDS/PROFILE_THEMES — this
    table only ever supplies an optional image for an already-eligible id."""

    template_id = models.CharField(max_length=30, choices=TEMPLATE_CHOICES, unique=True)
    image_url = models.URLField(max_length=500, blank=True, default="")
    image_public_id = models.CharField(max_length=255, blank=True, default="")
    display_order = models.PositiveIntegerField(default=0)
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["display_order", "id"]
        verbose_name = "Profile Template Preview"

    def __str__(self):
        return self.get_template_id_display()
