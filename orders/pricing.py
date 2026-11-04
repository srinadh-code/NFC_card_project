from decimal import Decimal

from common.discounts import get_catalog_product, get_product_pricing


class ProductUnavailable(Exception):
    """A line refers to a product that is missing, hidden or unpublished."""

    def __init__(self, name):
        super().__init__(name)
        self.name = name


def price_lines(lines, *, customer=None, promo_code=None, selected_offer_id=None):
    """Server-side pricing for checkout lines — the single implementation
    shared by the COD order view (orders/views.py) and the Razorpay checkout
    (payments/services.py), so both always charge exactly the same.

    `lines` are cart-line-like objects with product_id, name, card_type,
    color_name, qty and price (CartItem rows, or payments' guest lines).
    common.discounts decides which offer/promo applies and what it's worth;
    a line's own `price` is only a fallback when no pricing can be resolved
    for an otherwise available product.

    Returns (priced_items, amount) where each priced item carries the line
    plus the unit price and discount snapshot fields OrderItem stores.
    Raises ProductUnavailable for a line whose product can't be bought.
    """
    priced_items = []
    amount = Decimal("0")
    for item in lines:
        product = get_catalog_product(item.card_type, item.product_id)
        if product is None:
            raise ProductUnavailable(item.name)
        tier = product.offer_for_quantity(item.qty)
        pricing = get_product_pricing(
            item.card_type,
            promo_code=promo_code,
            customer=customer,
            selected_offer_id=selected_offer_id,
            product_id=item.product_id,
            qty=item.qty,
        )
        if pricing is not None:
            offer = pricing["offer"]
            priced_items.append(
                {
                    "item": item,
                    "unit_price": pricing["final_price"],
                    "original_price": pricing["original_price"],
                    "discount_type": offer.discount_type if offer else "",
                    "discount_value": pricing["discount_value"] if offer else None,
                    "discount_amount": pricing["discount_amount"] if offer else None,
                    "promo_code_used": promo_code if (offer and promo_code) else "",
                    "applied_offer": offer,
                    "pricing_tier": tier.label if tier and tier.min_quantity > 1 else "",
                }
            )
        else:
            priced_items.append(
                {
                    "item": item,
                    "unit_price": item.price,
                    "original_price": None,
                    "discount_type": "",
                    "discount_value": None,
                    "discount_amount": None,
                    "promo_code_used": "",
                    "applied_offer": None,
                    "pricing_tier": "",
                }
            )
        amount += priced_items[-1]["unit_price"] * item.qty
    return priced_items, amount
