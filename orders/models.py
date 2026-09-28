import random
import string
import uuid

from django.conf import settings
from django.db import models

# The 5-step fulfilment pipeline every non-cancelled order moves through.
# Modeled as explicit nullable timestamps (rather than a JSON blob) so each
# transition date is a real, queryable column — matches how `activated_on`/
# `assigned_on` are modeled on NfcCard.
TRACKING_STEPS = [
    ("placed_at", "Order Placed"),
    ("confirmed_at", "Order Confirmed"),
    ("shipped_at", "Shipped"),
    ("out_for_delivery_at", "Out for Delivery"),
    ("delivered_at", "Delivered"),
]

ORDER_NUMBER_PREFIX = "NXTRK"


def generate_order_number():
    """A short, public-safe order code (e.g. "NXTRK483920") — what a
    customer types into the public /track-order page. Deliberately not
    derived from the numeric `id` (so codes aren't sequentially guessable)
    and never exposed to a lookup other than order_number itself. Retries
    on the astronomically unlikely event of a collision across the
    900,000 possible 6-digit suffixes."""
    for _ in range(20):
        candidate = ORDER_NUMBER_PREFIX + "".join(random.choices(string.digits, k=6))
        if not Order.objects.filter(order_number=candidate).exists():
            return candidate
    raise RuntimeError("Could not generate a unique order number.")


class Order(models.Model):
    class Status(models.TextChoices):
        PENDING = "PENDING", "Pending"
        PROCESSING = "PROCESSING", "Processing"
        SHIPPED = "SHIPPED", "Shipped"
        DELIVERED = "DELIVERED", "Delivered"
        COMPLETED = "COMPLETED", "Completed"
        CANCELLED = "CANCELLED", "Cancelled"

    class PaymentMethod(models.TextChoices):
        UPI = "UPI", "UPI"
        CARD = "CARD", "Card"
        NET_BANKING = "NET_BANKING", "Net Banking"
        RAZORPAY = "RAZORPAY", "Razorpay"
        COD = "COD", "COD"

    class PaymentStatus(models.TextChoices):
        PAID = "PAID", "Paid"
        REFUNDED = "REFUNDED", "Refunded"
        FAILED = "FAILED", "Failed"
        PENDING = "PENDING", "Pending"

    customer = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name="orders"
    )
    status = models.CharField(max_length=12, choices=Status.choices, default=Status.PENDING)

    # Public-facing order code (see generate_order_number above) — the
    # identifier a customer types into the public /track-order page.
    # Nullable at the DB level only so existing rows can be backfilled by
    # migration; every order (new or backfilled) always ends up with one
    # via save() below.
    order_number = models.CharField(max_length=20, unique=True, null=True, blank=True, db_index=True)

    # Opaque, unguessable credential for the *anonymous* Track Order page —
    # the human-readable "ORD000013" shown to customers is just this row's
    # sequential pk zero-padded, so it alone must never grant access (an
    # attacker could just increment it). PublicOrderTrackingView requires
    # this token to match the order looked up by pk; an authenticated
    # customer viewing their own order (CustomerOrderDetailView) needs no
    # token, since ownership is already proven by the session.
    tracking_token = models.UUIDField(default=uuid.uuid4, unique=True, editable=False, db_index=True)

    # One-per-submission-attempt token the client generates and resends on
    # every retry/double-click of the *same* checkout attempt (see
    # CustomerOrderCreateSerializer/CustomerOrderListCreateView). Unique
    # per-customer (see Meta.constraints below) — not globally unique, since
    # two different customers' independently-generated keys coinciding is a
    # coincidence, not a duplicate. Nullable (not blank=True + default="")
    # so admin-created orders, which never send one, all store NULL rather
    # than colliding with each other on "".
    idempotency_key = models.CharField(max_length=64, null=True, blank=True, db_index=True)

    amount = models.DecimalField(max_digits=10, decimal_places=2)
    shipping = models.DecimalField(max_digits=10, decimal_places=2, default=0)
    payment_method = models.CharField(max_length=12, choices=PaymentMethod.choices)
    payment_status = models.CharField(max_length=10, choices=PaymentStatus.choices, default=PaymentStatus.PENDING)

    # Shipping address snapshot — kept on the order itself (not a live FK to a
    # profile/address record) so it stays accurate even if the customer later
    # edits their profile.
    shipping_line1 = models.CharField(max_length=255)
    shipping_city = models.CharField(max_length=100)
    shipping_state = models.CharField(max_length=100)
    shipping_pincode = models.CharField(max_length=12)
    shipping_country = models.CharField(max_length=100, default="India")

    # Fulfilment: the physical card admin ties to this order so it shows up
    # on the customer's My Card page. One card fulfils at most one order.
    assigned_card = models.OneToOneField(
        "nfc_cards.NfcCard",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="fulfils_order",
    )

    placed_at = models.DateTimeField(auto_now_add=True)
    confirmed_at = models.DateTimeField(null=True, blank=True)
    shipped_at = models.DateTimeField(null=True, blank=True)
    out_for_delivery_at = models.DateTimeField(null=True, blank=True)
    delivered_at = models.DateTimeField(null=True, blank=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-placed_at"]
        constraints = [
            models.UniqueConstraint(
                fields=["customer", "idempotency_key"],
                name="unique_customer_idempotency_key",
            ),
        ]

    def __str__(self):
        return f"Order #{self.id} ({self.customer.email})"

    def save(self, *args, **kwargs):
        if not self.order_number:
            self.order_number = generate_order_number()
        super().save(*args, **kwargs)

    @property
    def total(self):
        return self.amount + self.shipping


class OrderItem(models.Model):
    """Line item snapshot — no live FK to a Product model (the catalog is
    still a static frontend list, not a backend domain), so name/type/color/
    price are captured as they were at order time."""

    order = models.ForeignKey(Order, on_delete=models.CASCADE, related_name="items")
    product_id = models.CharField(max_length=40)
    name = models.CharField(max_length=150)
    card_type = models.CharField(max_length=10)
    color = models.CharField(max_length=30)
    qty = models.PositiveIntegerField(default=1)
    price = models.DecimalField(max_digits=10, decimal_places=2)

    def __str__(self):
        return f"{self.name} x{self.qty} (order #{self.order_id})"


class Transaction(models.Model):
    """Payment ledger entry for an order. No real payment gateway is wired
    up yet — rows are created/updated by admins for manual reconciliation
    (COD, bank transfer, gateway webhook to be added later)."""

    order = models.ForeignKey(Order, on_delete=models.CASCADE, related_name="transactions")
    amount = models.DecimalField(max_digits=10, decimal_places=2)
    method = models.CharField(max_length=12, choices=Order.PaymentMethod.choices)
    status = models.CharField(max_length=10, choices=Order.PaymentStatus.choices)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at"]

    def __str__(self):
        return f"Transaction #{self.id} for order #{self.order_id}"
