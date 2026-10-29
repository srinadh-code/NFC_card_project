"""
Single source of truth for "what does this product actually cost right
now" — every place a real price reaches a customer (the public /shop
catalog, the cart, checkout, order creation) computes through this module,
never by trusting a price a client sent or re-implementing the
percentage-vs-fixed-amount math per view.

There is no separate Offer/Discount model: an "offer" here is always a
customer_notifications.Announcement row with announcement_type=OFFER — the
announcement admin form's Offer Configuration section IS the pricing
admin. Deliberately placed in common/ (no app dependencies of its own) so
it can be imported by website_content, customer_cart and orders alike
without any of them depending on each other.
"""

from decimal import ROUND_HALF_UP, Decimal


def get_product_price(card_type):
    """Real, current, backend-authoritative base price for `card_type` —
    never trust a price a client claims. None if no active product exists
    for that card_type (see website_content.models.OrderCardProduct, the
    real product catalog — same one /shop reads)."""
    from website_content.models import OrderCardProduct

    product = OrderCardProduct.objects.filter(card_type=card_type, is_active=True).first()
    return product.price if product else None


def _offer_is_usable(offer, card_type, customer):
    return (
        offer.is_effectively_active()
        and offer.applies_to_card_type(card_type)
        and offer.is_eligible_for_customer(customer)
    )


def find_eligible_offer(card_type, promo_code=None, customer=None, selected_offer_id=None):
    """The one deterministic "which offer applies" rule — reused by the
    public catalog, cart, checkout and order creation, never
    re-implemented per call site. A promo code is never required to
    create, publish or apply an offer (see Announcement.promo_code, always
    optional) — this just decides which *already-published* offer, if any,
    currently discounts `card_type`, in strict priority order:

    1. `promo_code` — an explicit code the customer typed always wins if
       it matches a valid, eligible offer, regardless of that offer's own
       automatic_apply setting.
    2. `selected_offer_id` — an explicit "Apply Offer" click on a specific
       offer that has no promo code (see Cart.applied_offer /
       services.apply_offer) — same idea as a promo code, just selected by
       id instead of typed, and only used when no promo code is active.
    3. Otherwise, the best `automatic_apply=True` offer, chosen without
       any customer action. Discounts are never stacked — when more than
       one automatic offer qualifies for the same product, the one that
       gives the largest actual discount wins, tie-broken by lowest id so
       the result is stable and reproducible.

    `customer` gates first_order_only offers (Announcement.
    is_eligible_for_customer) — omitted/None (the public catalog, which
    has no authenticated customer) simply never matches one, rather than
    guessing eligibility."""
    from customer_management.customer_notifications.models import Announcement

    base_qs = Announcement.objects.filter(
        announcement_type=Announcement.AnnouncementType.OFFER,
        is_published=True,
    )

    if promo_code:
        offer = base_qs.filter(promo_code__iexact=promo_code.strip()).first()
        if offer is None or not _offer_is_usable(offer, card_type, customer):
            return None
        return offer

    if selected_offer_id:
        offer = base_qs.filter(pk=selected_offer_id).first()
        if offer is None or not _offer_is_usable(offer, card_type, customer):
            return None
        return offer

    candidates = [o for o in base_qs.filter(automatic_apply=True) if _offer_is_usable(o, card_type, customer)]
    if not candidates:
        return None

    price = get_product_price(card_type) or Decimal("0")
    candidates.sort(key=lambda o: (-calculate_price(price, o)["discount_amount"], o.id))
    return candidates[0]


def calculate_price(original_price, offer):
    """Pure math — no DB/eligibility lookups here, just turning
    (original_price, offer.discount_type/value) into a real final price.
    Clamped so a discount can never exceed the price itself (final price
    never negative) — the same clamp the admin-side validator warns about
    ahead of time, kept here too as the actual safety net."""
    original_price = Decimal(original_price)
    if offer is None:
        return {
            "original_price": original_price,
            "discount_type": None,
            "discount_value": None,
            "discount_amount": Decimal("0.00"),
            "final_price": original_price,
            "offer": None,
        }

    if offer.discount_type == offer.DiscountType.PERCENTAGE:
        pct = Decimal(offer.discount_percentage or 0)
        discount_value = offer.discount_percentage
        discount_amount = (original_price * pct / Decimal("100")).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
    else:
        discount_value = offer.discount_amount or Decimal("0.00")
        discount_amount = Decimal(discount_value)

    discount_amount = max(Decimal("0.00"), min(discount_amount, original_price))
    final_price = (original_price - discount_amount).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)

    return {
        "original_price": original_price,
        "discount_type": offer.discount_type,
        "discount_value": discount_value,
        "discount_amount": discount_amount,
        "final_price": final_price,
        "offer": offer,
    }


def get_product_pricing(card_type, promo_code=None, customer=None, selected_offer_id=None):
    """Convenience wrapper: real base price + whichever offer applies (auto,
    promo-code, or an explicit "Apply Offer" selection) + the computed
    final price — what the public catalog, cart and checkout each actually
    need. None if `card_type` isn't a real, active product."""
    original_price = get_product_price(card_type)
    if original_price is None:
        return None
    offer = find_eligible_offer(card_type, promo_code=promo_code, customer=customer, selected_offer_id=selected_offer_id)
    return calculate_price(original_price, offer)


# ---------------------------------------------------------------------
# First Order Discount — a second, universal discount layer, distinct from
# the Announcement/Offer promotional system above. Every new customer's
# first successful order gets this automatically; it is never configured
# per-product or per-announcement, so it lives as plain module-level
# settings here rather than a new admin-editable model. To change the
# percentage or turn it off, edit these two constants (see the announcement
# system above for a fully admin-configurable alternative if that's ever
# needed instead).
#
# Stacking rule (deliberately NOT the same "single winner" rule the
# Announcement/Offer system uses among *itself* — that rule still governs
# which single promotional offer applies): the promotional discount is
# calculated first; this discount then applies on top of the resulting,
# already-discounted subtotal. The two are separate, sequential layers by
# design, matching the project's explicit stacking requirement for this
# feature specifically.
# ---------------------------------------------------------------------

FIRST_ORDER_DISCOUNT_ENABLED = True
FIRST_ORDER_DISCOUNT_PERCENTAGE = Decimal("20")


def is_first_order_eligible(customer):
    """True only if `customer` has never had a *successful* order before —
    never just "an Order row exists". A cancelled, failed, or still-pending
    order must never consume this: only payment_status=PAID (and not
    subsequently cancelled) counts as a real, completed purchase. Local
    import of orders.models to avoid a circular import (orders/views.py
    already imports from this module)."""
    if customer is None or not getattr(customer, "is_authenticated", False):
        return False
    from orders.models import Order

    return not (
        Order.objects.filter(customer=customer, payment_status=Order.PaymentStatus.PAID)
        .exclude(status=Order.Status.CANCELLED)
        .exists()
    )


def calculate_first_order_discount(amount, customer):
    """`amount` is the cart/order's line-items total *after* whichever
    promotional Announcement/Offer discount already applied (see this
    module's stacking-rule note above) — never the raw catalog subtotal.
    Returns the additional first-order discount on top of that, or a
    no-op result (0 discount, amount unchanged) when disabled or the
    customer isn't eligible. Clamped the same way calculate_price() is, so
    a discount can never exceed the amount it's taken from."""
    amount = Decimal(amount)
    eligible = FIRST_ORDER_DISCOUNT_ENABLED and is_first_order_eligible(customer)
    if not eligible:
        return {
            "is_first_order": False,
            "percentage": None,
            "discount_amount": Decimal("0.00"),
            "final_amount": amount,
        }

    discount_amount = (amount * FIRST_ORDER_DISCOUNT_PERCENTAGE / Decimal("100")).quantize(
        Decimal("0.01"), rounding=ROUND_HALF_UP
    )
    discount_amount = max(Decimal("0.00"), min(discount_amount, amount))
    final_amount = (amount - discount_amount).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
    return {
        "is_first_order": True,
        "percentage": FIRST_ORDER_DISCOUNT_PERCENTAGE,
        "discount_amount": discount_amount,
        "final_amount": final_amount,
    }
