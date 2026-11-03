from django.db import models

from common.templates import TEMPLATE_CHOICES

#: Every cart/order line for a catalog product carries this product id —
#: "PRD-NEXORA-<SLUG>" (see Shop.tsx). OrderItem/CartItem.product_id is
#: max_length=40, which caps how long a slug can be.
PRODUCT_ID_PREFIX = "PRD-NEXORA-"
MAX_SLUG_LENGTH = 40 - len(PRODUCT_ID_PREFIX)


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
    # The single-card ("Buy 1") price — the "From" price on the product
    # card. When the product has bulk pricing tiers (see OrderCardProductOffer)
    # this is kept equal to the active quantity-1 tier on every admin save.
    price = models.DecimalField(max_digits=10, decimal_places=2)
    short_description = models.TextField(blank=True, default="")
    full_description = models.TextField(blank=True, default="")
    design = models.CharField(max_length=255, blank=True, default="")
    best_for = models.CharField(max_length=150, blank=True, default="")

    # Blank/0 means "no profile-template entitlement" (e.g. Google Review
    # Card) — the frontend hides the template-count UI entirely rather than
    # showing "0 Templates", same as before this was admin-editable.
    template_count = models.PositiveIntegerField(null=True, blank=True)

    card_type = models.CharField(max_length=10, choices=CardType.choices)
    # Used only when no image is uploaded — see image_url below.
    card_tone = models.CharField(max_length=10, choices=CardTone.choices, blank=True, default="")

    # Mirror of the primary gallery image's URL (see OrderCardProductImage),
    # kept for everything that only needs one picture of the product. The
    # gallery rows own their Cloudinary assets; image_public_id is only ever
    # set on a product saved before the gallery existed.
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

    # "How do I customise my card?" / "How it works?" block on the product
    # details screen. Instructions are one step per line.
    customisation_heading = models.CharField(max_length=200, blank=True, default="")
    customisation_description = models.TextField(blank=True, default="")
    customisation_instructions = models.TextField(blank=True, default="", help_text="One step per line")
    customisation_notes = models.TextField(blank=True, default="")
    customisation_image_url = models.URLField(max_length=500, blank=True, default="")
    customisation_image_public_id = models.CharField(max_length=255, blank=True, default="")

    popular = models.BooleanField(default=False)
    display_order = models.PositiveIntegerField(default=0)
    # Both must be true for the product to appear on /shop or be purchasable:
    # is_active is the list's on/off switch, is_published lets an admin
    # prepare (and preview) a product before customers can see it.
    is_active = models.BooleanField(default=True)
    is_published = models.BooleanField(default=True)

    class Meta:
        ordering = ["display_order", "id"]
        verbose_name = "Order Card Product"

    def __str__(self):
        return self.name

    @property
    def product_id(self):
        return f"{PRODUCT_ID_PREFIX}{self.slug.upper()}"

    def active_offers(self):
        # Uses the prefetch cache when the caller prefetched `offers`.
        return sorted((o for o in self.offers.all() if o.is_active), key=lambda o: o.min_quantity)

    def offer_for_quantity(self, qty):
        """The bulk tier that applies to `qty` cards: the active tier with
        the largest min_quantity not above qty. None when no tier applies,
        in which case the single-card `price` is used."""
        applicable = [o for o in self.active_offers() if o.min_quantity <= qty]
        return applicable[-1] if applicable else None

    def unit_price_for(self, qty):
        offer = self.offer_for_quantity(qty)
        return offer.unit_price if offer else self.price


class OrderCardProductImage(models.Model):
    """One gallery image of a product. Stored on Cloudinary through
    common.image_storage — this row holds the URL and the asset's public_id
    so a removed/replaced image's asset can be destroyed."""

    product = models.ForeignKey(OrderCardProduct, on_delete=models.CASCADE, related_name="images")
    image_url = models.URLField(max_length=500)
    image_public_id = models.CharField(max_length=255, blank=True, default="")
    alt_text = models.CharField(max_length=200, blank=True, default="")
    is_primary = models.BooleanField(default=False)
    display_order = models.PositiveIntegerField(default=0)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["display_order", "id"]
        verbose_name = "Order Card Product Image"

    def __str__(self):
        return f"{self.product} image #{self.pk}"


class OrderCardProductFeature(models.Model):
    """One benefit in a product's feature list (right column of the
    product details screen)."""

    product = models.ForeignKey(OrderCardProduct, on_delete=models.CASCADE, related_name="feature_items")
    label = models.CharField(max_length=150)
    icon = models.CharField(max_length=50, blank=True, default="", help_text="Optional Lucide icon name")
    display_order = models.PositiveIntegerField(default=0)
    is_active = models.BooleanField(default=True)

    class Meta:
        ordering = ["display_order", "id"]
        verbose_name = "Order Card Product Feature"

    def __str__(self):
        return self.label


class OrderCardProductOffer(models.Model):
    """A bulk pricing tier ("Buy 3 — ₹475 / card"). The tier with the
    largest min_quantity not above the ordered quantity sets the per-card
    price; common.discounts reads it, so the cart and checkout always price
    from here, never from the browser."""

    product = models.ForeignKey(OrderCardProduct, on_delete=models.CASCADE, related_name="offers")
    label = models.CharField(max_length=50)
    min_quantity = models.PositiveIntegerField()
    unit_price = models.DecimalField(max_digits=10, decimal_places=2)
    # Optional override for the savings line ("Save ₹75"); computed from the
    # single-card price when blank.
    savings_text = models.CharField(max_length=100, blank=True, default="")
    display_order = models.PositiveIntegerField(default=0)
    is_active = models.BooleanField(default=True)

    class Meta:
        ordering = ["min_quantity", "id"]
        verbose_name = "Order Card Product Offer"
        constraints = [
            models.UniqueConstraint(fields=["product", "min_quantity"], name="unique_order_card_offer_quantity"),
        ]

    def __str__(self):
        return f"{self.product}: {self.label}"


class OrderCardProductTimelineStage(models.Model):
    """One step of the "Order & Delivery Timeline" on the product details
    screen (e.g. "Order Shipped — Within 3-4 Days")."""

    product = models.ForeignKey(OrderCardProduct, on_delete=models.CASCADE, related_name="timeline_stages")
    title = models.CharField(max_length=100)
    description = models.CharField(max_length=255, blank=True, default="")
    estimate = models.CharField(max_length=60, blank=True, default="", help_text='e.g. "Within 1-2 Days"')
    icon = models.CharField(max_length=50, blank=True, default="", help_text="Optional Lucide icon name")
    display_order = models.PositiveIntegerField(default=0)
    is_active = models.BooleanField(default=True)

    class Meta:
        ordering = ["display_order", "id"]
        verbose_name = "Order Card Timeline Stage"

    def __str__(self):
        return f"{self.product}: {self.title}"


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
