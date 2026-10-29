from decimal import Decimal

from common.discounts import calculate_price, find_eligible_offer, get_product_price

from .models import Cart, CartItem


def get_or_create_cart(user):
    """The one and only entry point for "get this user's cart" anywhere in
    the codebase — always keyed by the authenticated user, never by
    guessing/trusting an id from the request. A brand-new customer gets an
    empty cart created transparently on first touch."""
    cart, _ = Cart.objects.get_or_create(customer=user)
    return cart


def get_owned_item(user, pk):
    """Scoped by cart__customer=user — a cart item id that exists but
    belongs to a different customer resolves to None here, same as one
    that doesn't exist at all, so callers can return an identical 404
    either way (never leaking whether another customer's item exists)."""
    return CartItem.objects.filter(pk=pk, cart__customer=user).first()


def add_item(user, data):
    """Adds a line to the user's own cart, merging into an existing
    matching (product_id, color_name) row by increasing its qty — mirrors
    the frontend cart's pre-existing merge behavior — rather than ever
    creating a duplicate line or touching another customer's cart."""
    cart = get_or_create_cart(user)
    existing = CartItem.objects.filter(cart=cart, product_id=data["product_id"], color_name=data["color_name"]).first()
    if existing:
        existing.qty += data["qty"]
        existing.save(update_fields=["qty", "updated_at"])
        return existing
    return CartItem.objects.create(cart=cart, **data)


def apply_promo_code(user, code):
    """Validates `code` against every line currently in the cart — it must
    match at least one item's eligible offer (common.discounts is the only
    place that decides eligibility) or this is rejected outright, never
    stored as a "maybe" that CartSerializer would have to explain away
    later. Clears any explicit "Apply Offer" selection — only one manual
    selection is ever in effect at a time (see apply_offer). Returns
    (cart, error_message) — error_message is None on success."""
    cart = get_or_create_cart(user)
    items = list(cart.items.all())
    if not items:
        return cart, "Your cart is empty."

    matched = any(find_eligible_offer(item.card_type, promo_code=code, customer=user) for item in items)
    if not matched:
        return cart, "Invalid or expired promo code."

    cart.promo_code = code.strip()
    cart.applied_offer = None
    cart.save(update_fields=["promo_code", "applied_offer", "updated_at"])
    return cart, None


def remove_promo_code(user):
    cart = get_or_create_cart(user)
    cart.promo_code = ""
    cart.save(update_fields=["promo_code", "updated_at"])
    return cart


def apply_offer(user, offer_id):
    """The "Apply Offer" button — for an offer that has no promo code and
    isn't automatic_apply, so it would otherwise never discount anything
    (common.discounts.find_eligible_offer's automatic branch skips
    automatic_apply=False, and its promo_code branch needs a code). Runs
    the exact same eligibility checks find_eligible_offer would, so a
    rejection here always matches what checkout will (re)validate — never
    a looser check that a later read then silently overrides. Clears any
    promo code already on the cart (only one manual selection at a time).
    Returns (cart, error_message) — error_message is None on success."""
    from customer_management.customer_notifications.models import Announcement

    cart = get_or_create_cart(user)
    items = list(cart.items.all())
    if not items:
        return cart, "Your cart is empty."

    offer = Announcement.objects.filter(
        pk=offer_id, announcement_type=Announcement.AnnouncementType.OFFER, is_published=True
    ).first()
    if offer is None:
        return cart, "Offer not found."
    if not offer.is_effectively_active():
        return cart, "This offer is no longer available."
    if not any(offer.applies_to_card_type(item.card_type) for item in items):
        return cart, "This offer is not applicable to the selected product."
    if not offer.is_eligible_for_customer(user):
        return cart, "This offer is available only on your first order."

    cart.applied_offer = offer
    cart.promo_code = ""
    cart.save(update_fields=["applied_offer", "promo_code", "updated_at"])
    return cart, None


def remove_offer(user):
    cart = get_or_create_cart(user)
    cart.applied_offer = None
    cart.save(update_fields=["applied_offer", "updated_at"])
    return cart


def available_offers(user, cart):
    """Powers Checkout's "Offers & Discounts" section.

    `applied`: the offer(s) actually discounting this cart right now —
    mirrors common.discounts.find_eligible_offer exactly, one winner per
    distinct card_type in the cart, so this can never disagree with what
    the cart/checkout/order totals already show. `can_remove` is only true
    for the customer's own explicit selection (typed code, or an "Apply
    Offer" click) — a plain automatic offer has nothing to remove.

    `available`: an eligible, currently-active offer with no promo code
    that isn't automatic_apply — needs an explicit "Apply Offer" click
    (see apply_offer).

    `unavailable`: an offer that targets a product in this cart but isn't
    (yet) in effect, with the real reason — never a promo-code-only offer,
    since those are only ever discoverable through the offer's own
    marketing, not by browsing checkout."""
    from customer_management.customer_notifications.models import Announcement

    items = list(cart.items.all())
    card_types = {item.card_type for item in items}
    if not card_types:
        return {"applied": [], "available": [], "unavailable": []}

    applied = []
    applied_ids = set()
    for card_type in card_types:
        winner = find_eligible_offer(
            card_type, promo_code=cart.promo_code or None, customer=user, selected_offer_id=cart.applied_offer_id
        )
        if winner is None or winner.id in applied_ids:
            continue
        applied_ids.add(winner.id)
        price = get_product_price(card_type) or Decimal("0")
        pricing = calculate_price(price, winner)
        can_remove = bool(cart.promo_code) or winner.id == cart.applied_offer_id
        applied.append(
            {
                "id": winner.id,
                "title": winner.offer_title or winner.title,
                "discount_type": winner.discount_type,
                "discount_value": pricing["discount_value"],
                "promo_code": winner.promo_code or None,
                "end_at": winner.end_at,
                "can_remove": can_remove,
            }
        )

    available = []
    unavailable = []
    candidates = Announcement.objects.filter(
        announcement_type=Announcement.AnnouncementType.OFFER,
        is_published=True,
    ).exclude(pk__in=applied_ids)
    for offer in candidates:
        if not offer.is_effectively_active():
            continue
        matching_card_types = [ct for ct in card_types if offer.applies_to_card_type(ct)]
        if not matching_card_types:
            continue
        if offer.promo_code and not offer.automatic_apply:
            # Not discoverable by browsing — only via the code itself.
            continue

        if not offer.is_eligible_for_customer(user):
            unavailable.append(
                {
                    "id": offer.id,
                    "title": offer.offer_title or offer.title,
                    "reason": "This offer is available only on your first order.",
                }
            )
        elif offer.automatic_apply:
            # Eligible and automatic, but a better automatic offer already
            # won for every card_type it targets.
            unavailable.append(
                {
                    "id": offer.id,
                    "title": offer.offer_title or offer.title,
                    "reason": "A better offer is already applied to your cart.",
                }
            )
        else:
            price = get_product_price(matching_card_types[0]) or Decimal("0")
            pricing = calculate_price(price, offer)
            available.append(
                {
                    "id": offer.id,
                    "title": offer.offer_title or offer.title,
                    "discount_type": offer.discount_type,
                    "discount_value": pricing["discount_value"],
                    "end_at": offer.end_at,
                }
            )

    return {"applied": applied, "available": available, "unavailable": unavailable}


def clear_cart(user):
    """Called once, server-side, right after an order is successfully
    created from this user's cart (see orders.views) — deletes only this
    user's own cart items, never another customer's. Also resets any
    applied promo code/offer selection: both were already snapshotted onto
    the new order's items, and either silently carrying over into the
    customer's next, unrelated cart would be surprising."""
    CartItem.objects.filter(cart__customer=user).delete()
    Cart.objects.filter(customer=user).update(promo_code="", applied_offer=None)
