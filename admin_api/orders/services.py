# Order business rules kept out of the views — status transitions and card
# fulfilment both touch more than one field/model atomically, so they live
# here as plain functions the views call and wrap in a transaction.
from django.utils import timezone

from nfc_cards.models import NfcCard
from orders.models import Order

STEP_FIELDS = ["placed_at", "confirmed_at", "shipped_at", "out_for_delivery_at", "delivered_at"]


def _reached_step(status):
    return {
        Order.Status.PENDING: 0,
        Order.Status.PROCESSING: 1,
        Order.Status.SHIPPED: 2,
        Order.Status.DELIVERED: 4,
        Order.Status.COMPLETED: 4,
        Order.Status.CANCELLED: 0,
    }[status]


def apply_status_transition(order, new_status):
    """Moves `order` to `new_status`, stamping any newly-reached tracking
    step with now() while leaving already-reached ones untouched — mirrors
    the frontend's previous client-side `retrackOrder` behaviour exactly,
    just backed by real persisted timestamps instead of a recomputed array."""
    if order.status == Order.Status.CANCELLED:
        raise ValueError("Cannot change the status of a cancelled order.")

    update_fields = ["status", "updated_at"]
    if new_status != Order.Status.CANCELLED:
        reached = _reached_step(new_status)
        now = timezone.now()
        for i, field in enumerate(STEP_FIELDS):
            if i <= reached and getattr(order, field) is None:
                setattr(order, field, now)
                update_fields.append(field)

    order.status = new_status
    order.save(update_fields=update_fields)
    return order


def assign_card_to_order(order, card):
    """Ties a physical card to an order (and its customer) to fulfil it.
    Only an unassigned card, or the card already fulfilling this exact
    order (a no-op re-confirm), is eligible — reassigning frees the
    previously-linked card back to stock."""
    if order.status == Order.Status.CANCELLED:
        raise ValueError("Cannot assign a card to a cancelled order.")

    already_this_order = order.assigned_card_id == card.id
    if card.status != NfcCard.Status.UNASSIGNED and not already_this_order:
        raise ValueError("This card is not available for assignment.")

    previous_card = order.assigned_card
    if previous_card and previous_card.id != card.id:
        previous_card.user = None
        previous_card.status = NfcCard.Status.UNASSIGNED
        previous_card.assigned_on = None
        previous_card.save(update_fields=["user", "status", "assigned_on", "updated_at"])

    now = timezone.now()
    card.user = order.customer
    card.status = NfcCard.Status.ASSIGNED
    card.assigned_on = now
    card.save(update_fields=["user", "status", "assigned_on", "updated_at"])

    order.assigned_card = card
    order.save(update_fields=["assigned_card", "updated_at"])
    return order
