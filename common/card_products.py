"""Existing card identifiers and the two independent ownership categories."""

DIGITAL_CARD_TYPE = "CUSTOM"
REVIEW_CARD_TYPE = "REVIEW"
DIGITAL_CARD_TYPES = ("CUSTOM", "WOODEN")
CARD_TYPES = (*DIGITAL_CARD_TYPES, REVIEW_CARD_TYPE)


def allocation_card_type(card_type):
    """Wooden and Custom share one digital allocation; Review is separate."""
    if card_type == REVIEW_CARD_TYPE:
        return REVIEW_CARD_TYPE
    if card_type in DIGITAL_CARD_TYPES:
        return DIGITAL_CARD_TYPE
    return ""


def recipient_card_type(recipient):
    """Resolve a historical slot only when its product is unambiguous.

    Never guess a product from the purchaser's identity or rewrite an old
    mixed-product order. New allocations carry their own immutable type.
    """
    if recipient.card_type in CARD_TYPES:
        return recipient.card_type
    types = set(recipient.order.items.values_list("card_type", flat=True))
    if len(types) == 1:
        card_type = types.pop()
        return card_type if card_type in CARD_TYPES else ""
    if recipient.assigned_card_id:
        card_type = recipient.assigned_card.card_type
        if card_type in CARD_TYPES and (not types or card_type in types):
            return card_type
    return ""


def recipient_product_slots(lines):
    """Expand server-owned line snapshots in the existing recipient order."""
    slots = []
    for line in lines:
        if isinstance(line, dict):
            card_type, product_id, qty = line.get("card_type"), line.get("product_id"), line.get("qty", 0)
        else:
            card_type, product_id, qty = line.card_type, line.product_id, line.qty
        if card_type not in CARD_TYPES or type(qty) is not int or not 1 <= qty <= 10 or len(slots) + qty > 10:
            raise ValueError("The purchased card product could not be identified.")
        slots.extend({"card_type": card_type, "product_id": product_id} for _ in range(qty))
    return slots
