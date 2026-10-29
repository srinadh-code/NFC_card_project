from django.conf import settings
from django.db import models


class Cart(models.Model):
    """Exactly one cart per customer (OneToOne, not ForeignKey) — there is
    no concept of multiple simultaneous carts here, so "the customer's
    cart" is always unambiguous: Cart.objects.get(customer=request.user),
    never Cart.objects.first() or any other query that could return a
    different customer's row. Created lazily (get_or_create) the first
    time a customer's cart is touched, so a brand-new customer simply has
    no row yet rather than a pre-seeded one."""

    customer = models.OneToOneField(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="cart")
    # Explicit customer action ("enter promo code") — separate from
    # automatic_apply offers, which need no code and are computed live at
    # read time without ever being stored here. Validated against
    # common.discounts.find_eligible_offer on every apply, never trusted
    # as still-valid just because it was once accepted.
    promo_code = models.CharField(max_length=50, blank=True, default="")
    # Explicit customer action for an offer that has NO promo code and
    # isn't automatic_apply — the "Apply Offer" button (see
    # services.apply_offer/remove_offer). Mutually exclusive with
    # promo_code in practice (applying one clears the other), since only
    # one manual selection can be in effect at a time — same "single
    # winner" rule as everywhere else. SET_NULL: deleting the offer later
    # never breaks this row, it just stops applying (see
    # common.discounts.find_eligible_offer).
    applied_offer = models.ForeignKey(
        "customer_notifications.Announcement", on_delete=models.SET_NULL, null=True, blank=True, related_name="+"
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self):
        return f"Cart for {self.customer.email}"


class CartItem(models.Model):
    """One line in a customer's cart — no live FK to a Product model (the
    catalog is still a static/admin-editable frontend list, not a backend
    domain model; same reasoning as orders.models.OrderItem), so
    name/card_type/color/price are captured as they were when added.
    `unique_together` on (cart, product_id, color_name) means adding the
    same product+color again increases the existing row's qty instead of
    creating a duplicate line — mirrors the frontend cart's pre-existing
    merge-by-product-and-color behavior."""

    cart = models.ForeignKey(Cart, on_delete=models.CASCADE, related_name="items")
    product_id = models.CharField(max_length=40)
    name = models.CharField(max_length=150)
    card_type = models.CharField(max_length=10)
    color_name = models.CharField(max_length=30)
    color_hex = models.CharField(max_length=10, blank=True, default="")
    qty = models.PositiveIntegerField(default=1)
    price = models.DecimalField(max_digits=10, decimal_places=2)

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["created_at"]
        constraints = [
            models.UniqueConstraint(fields=["cart", "product_id", "color_name"], name="unique_cart_product_color"),
        ]

    def __str__(self):
        return f"{self.name} x{self.qty} (cart #{self.cart_id})"
