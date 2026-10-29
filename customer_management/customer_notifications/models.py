from django.conf import settings
from django.core.exceptions import ValidationError
from django.core.validators import MaxValueValidator, MinValueValidator
from django.db import models
from django.utils import timezone


class Announcement(models.Model):
    """A single admin-authored broadcast — "System Messages" plus
    promotional offers, unified into one model rather than two parallel
    systems. Depending on `display_location`, a published+currently-active
    announcement:
      - fans out to a Notification (type=SYSTEM_MESSAGE) for every customer,
        exactly like the original System Message behaviour — see
        services.sync_due_customer_announcements(), and
      - and/or is served by the public, unauthenticated
        PublicAnnouncementListView for the marketing site.

    Kept here, next to Notification/notify(), rather than as a new app,
    since sending one *is* just creating Notifications."""

    class AnnouncementType(models.TextChoices):
        GENERAL = "GENERAL", "General Announcement"
        FESTIVAL = "FESTIVAL", "Festival"
        OFFER = "OFFER", "Offer / Promotion"
        PRODUCT = "PRODUCT", "New Product"
        IMPORTANT = "IMPORTANT", "Important Update"
        MAINTENANCE = "MAINTENANCE", "Maintenance"
        FEATURE = "FEATURE", "Feature Update"

    class DisplayLocation(models.TextChoices):
        CUSTOMER = "CUSTOMER", "Customer Dashboard"
        PUBLIC = "PUBLIC", "Public Website"
        BOTH = "BOTH", "Both"

    class DiscountType(models.TextChoices):
        PERCENTAGE = "PERCENTAGE", "Percentage"
        FIXED = "FIXED", "Fixed Amount"

    title = models.CharField(max_length=200)
    message = models.TextField(blank=True)
    announcement_type = models.CharField(
        max_length=20, choices=AnnouncementType.choices, default=AnnouncementType.GENERAL
    )
    display_location = models.CharField(
        max_length=10, choices=DisplayLocation.choices, default=DisplayLocation.CUSTOMER
    )

    # The one real admin-controlled state — "Save Draft" leaves this False,
    # "Publish"/"Disable" toggle it. Everything else about the 5-state
    # Draft/Scheduled/Active/Expired/Disabled status shown in the admin UI
    # is derived from this + ever_published + start_at/end_at (see
    # effective_status()) rather than stored, so it can never drift out of
    # sync with the clock.
    is_published = models.BooleanField(default=False)
    # Distinguishes "never published" (Draft) from "was live, admin turned
    # it back off" (Disabled) — both have is_published=False, but they mean
    # different things to an admin reviewing the list. Set once, the first
    # time this ever gets published, and never cleared.
    ever_published = models.BooleanField(default=False)

    start_at = models.DateTimeField(
        null=True, blank=True, help_text="When this becomes visible. Blank = immediately."
    )
    end_at = models.DateTimeField(
        null=True, blank=True, help_text="When this stops being visible. Blank = never expires on its own."
    )

    # Offer / Promotion fields — optional even when announcement_type is
    # OFFER (see AnnouncementWriteSerializer): an admin may publish an offer
    # banner with only a title/message and no discount/promo code yet.
    # `discount_type` picks which of the two value fields below is the real
    # one — kept as two typed fields (not one ambiguous "value" column)
    # since a PositiveSmallIntegerField 0-100 and a money DecimalField have
    # different validation; common/discounts.py reads whichever one
    # `discount_type` names.
    offer_title = models.CharField(max_length=200, blank=True, default="")
    discount_type = models.CharField(max_length=10, choices=DiscountType.choices, default=DiscountType.PERCENTAGE)
    discount_percentage = models.PositiveSmallIntegerField(
        null=True, blank=True, validators=[MinValueValidator(0), MaxValueValidator(100)]
    )
    discount_amount = models.DecimalField(max_digits=10, decimal_places=2, null=True, blank=True)
    promo_code = models.CharField(max_length=50, blank=True, default="")
    # ON: applies the moment it's eligible, no code needed (still only one
    # offer per product — see common.discounts.find_eligible_offer). OFF:
    # only a matching promo_code request applies this offer at all.
    automatic_apply = models.BooleanField(default=True)
    # Product eligibility — reuses website_content.OrderCardProduct.card_type
    # as the eligibility key (the real product catalog) rather than a new
    # product/offer link table, matching this project's existing "small
    # selection list -> plain field, not a child model" convention (see
    # OrderCardProduct.features). Blank/true means every product.
    applies_to_all_products = models.BooleanField(default=True)
    applicable_card_types = models.CharField(
        max_length=100,
        blank=True,
        default="",
        help_text="Comma-separated OrderCardProduct.card_type values. Ignored when applies_to_all_products is set.",
    )
    cta_text = models.CharField(max_length=50, blank=True, default="")
    cta_link = models.CharField(max_length=255, blank=True, default="")
    # Customer eligibility. OFF (default): every customer. ON: only a
    # customer with zero previous orders — checked against the real Order
    # model at apply-time (common.discounts), never a client-supplied flag.
    first_order_only = models.BooleanField(default=False)

    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True, related_name="+"
    )
    # How many customers actually got a Notification for this announcement
    # (i.e. had notify_system_messages on) — recorded at fan-out time so the
    # admin list view doesn't need to reconstruct it from Notification rows
    # later, which would drift once a customer reads/deletes theirs.
    recipient_count = models.PositiveIntegerField(default=0)
    # Set once sync_due_customer_announcements() has fanned this one out to
    # customer Notifications — the guard that makes that fan-out idempotent
    # (never re-sent just because a customer re-opens their notification
    # bell) and the marker of "has this been sent yet" for is_effectively_active.
    notified_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-created_at"]

    def __str__(self):
        return self.title

    def clean(self):
        if self.start_at and self.end_at and self.start_at > self.end_at:
            raise ValidationError("Start date cannot be after end date.")

    def effective_status(self, now=None):
        """The 5-state status shown in the admin UI — always computed from
        is_published/ever_published + the current clock, never stored, so
        it's never stale."""
        if not self.is_published:
            return "disabled" if self.ever_published else "draft"
        now = now or timezone.now()
        if self.end_at and self.end_at < now:
            return "expired"
        if self.start_at and self.start_at > now:
            return "scheduled"
        return "active"

    def is_effectively_active(self, now=None):
        return self.effective_status(now) == "active"

    def applies_to_card_type(self, card_type):
        if self.applies_to_all_products:
            return True
        eligible = {c.strip() for c in self.applicable_card_types.split(",") if c.strip()}
        return card_type in eligible

    def is_eligible_for_customer(self, customer):
        """First-order-only gating — real order history, never a client
        claim. An anonymous/unknown customer (public catalog preview, no
        request.user) never qualifies for a first-order offer: there's
        nothing to check eligibility against, so it's safer to withhold it
        than to assume eligible."""
        if not self.first_order_only:
            return True
        if customer is None or not getattr(customer, "is_authenticated", False):
            return False
        from orders.models import Order

        return not Order.objects.filter(customer=customer).exists()


class Notification(models.Model):
    class Type(models.TextChoices):
        ORDER_UPDATE = "ORDER_UPDATE", "Order Updates"
        NFC_UPDATE = "NFC_UPDATE", "NFC Updates"
        PROFILE_VIEW = "PROFILE_VIEW", "Profile Views"
        SYSTEM_MESSAGE = "SYSTEM_MESSAGE", "System Messages"

    user = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="notifications"
    )
    title = models.CharField(max_length=200)
    message = models.TextField(blank=True)
    type = models.CharField(max_length=20, choices=Type.choices, default=Type.SYSTEM_MESSAGE)
    is_read = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)
    # Set only for a SYSTEM_MESSAGE created from an Announcement — lets the
    # notification bell render the source announcement's offer/CTA details
    # (discount, promo code, "View Offer" button) without a second customer-
    # facing API. SET_NULL on delete: removing the Announcement later must
    # never delete a customer's own notification, only the enrichment.
    announcement = models.ForeignKey(
        Announcement, on_delete=models.SET_NULL, null=True, blank=True, related_name="notifications"
    )

    class Meta:
        ordering = ["-created_at"]

    def __str__(self):
        return f"{self.title} -> {self.user_id}"
