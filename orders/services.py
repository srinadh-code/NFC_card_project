from common.templates import CARD_TYPE_TO_PLAN, DEFAULT_PLAN, PLAN_RANK, templates_for_plan

from .models import Order


def resolve_customer_plan(user):
    """The highest-tier plan implied by a customer's paid orders.

    Derived from OrderItem.card_type (CLASSIC/PREMIUM/CUSTOM/WOODEN) rather
    than a dedicated Plan model — this codebase has no Product/Plan table
    yet, and the frontend's tier catalog already maps each sellable tier
    onto this same CardType enum for exactly this purpose. Defaults to the
    base Classic entitlement for a customer with no paid orders, rather than
    granting nothing.
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
    """Template ids the given user is entitled to select, per their plan."""
    return templates_for_plan(resolve_customer_plan(user))
