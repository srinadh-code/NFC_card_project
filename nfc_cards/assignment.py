"""Email identity and locking for new physical-card ownership assignments."""
from django.db.models.functions import Lower, Trim

from accounts.models import User

from .models import NfcCard


def normalize_assignment_email(email):
    return (email or "").strip().lower()


def assignment_accounts(email):
    return User.objects.alias(_assignment_email=Lower(Trim("email"))).filter(
        _assignment_email=normalize_assignment_email(email)
    )


def assigned_card_emails():
    # Ownership counts in every status, including inactive, blocked and lost.
    return NfcCard.objects.filter(user__isnull=False).annotate(
        _assignment_email=Lower(Trim("user__email"))
    ).values("_assignment_email")


def ensure_card_assignment_available(customer, *, card=None, replacing_card_id=None):
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
    if card is not None:
        existing = existing.exclude(pk=card.pk)
    if replacing_card_id is not None:
        existing = existing.exclude(pk=replacing_card_id)
    if existing.exists():
        raise ValueError("This email already has an assigned NFC card.")
