from common.templates import CARD_TYPE_TO_PLAN, CUSTOM_PLAN, DEFAULT_PLAN, PLAN_RANK, templates_for_plan

from .models import Order


def compose_shipping_snapshot(address):
    """Flattens a customer_addresses.models.CustomerAddress's richer field
    set (line1/line2/landmark/locality/district) into the single
    shipping_line1 string Order actually has a column for — the same
    composition the checkout frontend used to do client-side (see
    Checkout.tsx's old buildShippingLine1) before addresses became a real,
    server-owned address book. Returns a dict ready to spread into
    Order.objects.create(...).

    This is the ONE moment a CustomerAddress's data is copied onto an
    Order — after this, the order's shipping_* columns are the sole,
    independent, immutable record of "where this order shipped to", never
    read from the address again. Editing or deleting the source
    CustomerAddress afterward has zero effect on any existing order.
    """
    line1_parts = [
        address.address_line1,
        address.address_line2,
        address.landmark,
        address.locality,
        f"Dist. {address.district}" if address.district else "",
    ]
    return {
        "shipping_line1": ", ".join(p.strip() for p in line1_parts if p and p.strip()),
        "shipping_city": address.city,
        "shipping_state": address.state,
        "shipping_pincode": address.pincode,
        "shipping_country": address.country,
    }


def resolve_customer_plan(user):
    """The highest-tier plan implied by a customer's paid orders.

    Derived from OrderItem.card_type (CUSTOM/WOODEN — CLASSIC/PREMIUM were
    retired and no OrderItem row can carry them anymore) rather than a
    dedicated Plan model — this codebase has no Product/Plan table yet, and
    the frontend's tier catalog already maps its one sellable tier onto this
    same CardType enum for exactly this purpose. Defaults to the base
    Classic entitlement for a customer with no paid orders, rather than
    granting nothing.

    Purely informational at this point (see `get_allowed_templates` below,
    which no longer reads this) — kept for whatever else still wants to
    know a customer's resolved plan (e.g. the profile API's `plan` field).
    """
    if user is None or not getattr(user, "is_authenticated", False):
        return DEFAULT_PLAN

    card_types = (
        Order.objects.filter(customer=user, payment_status=Order.PaymentStatus.PAID)
        .values_list("items__card_type", flat=True)
        .distinct()
    )
    plans = {CARD_TYPE_TO_PLAN.get(ct, DEFAULT_PLAN) for ct in card_types if ct}
    if not plans:
        return DEFAULT_PLAN
    return max(plans, key=lambda p: PLAN_RANK.get(p, 0))


def get_allowed_templates(user):
    """Template ids the given user may select from.

    No longer gated by purchase plan: NEXORA Classic/Premium are retired,
    and the product decision (matching the frontend, which now shows all 5
    of these to every customer regardless of what they've bought) is that
    profile-template choice is independent of which card/product a customer
    purchased. Every customer gets the same fixed 5 templates that used to
    be Custom-plan-exclusive — `user` is accepted for backward compatibility
    with existing call sites but is otherwise unused now.
    """
    return templates_for_plan(CUSTOM_PLAN)
