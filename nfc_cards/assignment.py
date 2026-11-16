"""Email identity and locking for new physical-card ownership assignments."""
from django.db.models.functions import Lower, Trim

from accounts.models import User
from common.card_products import DIGITAL_CARD_TYPES, allocation_card_type, recipient_card_type

from .models import NfcCard


def normalize_assignment_email(email):
    return (email or "").strip().lower()


def assignment_accounts(email):
    return User.objects.alias(_assignment_email=Lower(Trim("email"))).filter(
        _assignment_email=normalize_assignment_email(email)
    )


def assigned_card_emails(card_type=None):
    # Ownership counts in every status, including inactive, blocked and lost.
    cards = NfcCard.objects.filter(user__isnull=False)
    if card_type:
        cards = cards.filter(card_type__in=DIGITAL_CARD_TYPES) if allocation_card_type(card_type) == "CUSTOM" else cards.filter(card_type=card_type)
    return cards.annotate(
        _assignment_email=Lower(Trim("user__email"))
    ).values("_assignment_email")


def ensure_card_assignment_available(customer, *, card=None, replacing_card_id=None, card_type=None):
    """Call inside the assignment transaction before creating ownership.

    Lock all accounts sharing the normalized email so concurrent assignments
    of different inventory cards serialize on the same identity. Unchanged
    ownership remains editable, including historical duplicate assignments.
    """
    email = normalize_assignment_email(customer.email)
    list(assignment_accounts(email).select_for_update().order_by("pk"))
    if card is not None and card.user_id and normalize_assignment_email(card.user.email) == email:
        return
    existing = NfcCard.objects.alias(_assignment_email=Lower(Trim("user__email"))).filter(_assignment_email=email)
    product_type = card.card_type if card is not None else card_type
    if product_type:
        existing = existing.filter(card_type__in=DIGITAL_CARD_TYPES) if allocation_card_type(product_type) == "CUSTOM" else existing.filter(card_type=product_type)
    if card is not None:
        existing = existing.exclude(pk=card.pk)
    if replacing_card_id is not None:
        existing = existing.exclude(pk=replacing_card_id)
    if existing.exists():
        raise ValueError("This email already has an assigned NFC card for this product.")


def eligible_assignment_recipients(*, card_type, customer=None):
    """Paid, ledger-backed slots matching actual inventory, including old unambiguous orders."""
    from django.db.models import Exists, OuterRef
    from orders.models import Order, OrderRecipient, Transaction

    rows = OrderRecipient.objects.filter(
        order__payment_status=Order.PaymentStatus.PAID,
        assigned_card__isnull=True,
        user__isnull=False,
    ).exclude(order__status=Order.Status.CANCELLED).annotate(
        _paid_ledger=Exists(Transaction.objects.filter(order_id=OuterRef("order_id"), status=Order.PaymentStatus.PAID))
    ).filter(_paid_ledger=True).select_related("order", "user", "assigned_card").prefetch_related("order__items")
    if customer is not None:
        rows = rows.filter(user=customer)
    unavailable = set(assigned_card_emails(card_type).values_list("_assignment_email", flat=True))
    return [row for row in rows.order_by("pk") if recipient_card_type(row) == card_type and normalize_assignment_email(row.user.email) not in unavailable]


def assignment_recipient(customer, card_type, recipient_id=None):
    rows = eligible_assignment_recipients(card_type=card_type, customer=customer)
    if recipient_id is not None:
        rows = [row for row in rows if row.pk == recipient_id]
    if len(rows) != 1:
        raise ValueError("Choose an unassigned, paid recipient allocation matching this card product.")
    return rows[0]
