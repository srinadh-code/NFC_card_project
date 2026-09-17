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


def clear_cart(user):
    """Called once, server-side, right after an order is successfully
    created from this user's cart (see orders.views) — deletes only this
    user's own cart items, never another customer's."""
    CartItem.objects.filter(cart__customer=user).delete()
