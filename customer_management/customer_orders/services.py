from decimal import Decimal

from django.db import transaction

from .models import Order, OrderItem


@transaction.atomic
def create_order(user, validated_data):
    items_data = validated_data.pop("items")
    discount = validated_data.pop("discount", Decimal("0"))

    subtotal = sum((item["unit_price"] * item["quantity"] for item in items_data), Decimal("0"))
    total = subtotal - discount

    order = Order.objects.create(
        user=user,
        order_number=Order.generate_order_number(),
        subtotal=subtotal,
        discount=discount,
        total=total,
        **validated_data,
    )

    OrderItem.objects.bulk_create(
        [
            OrderItem(
                order=order,
                card_type=item["card_type"],
                color=item["color"],
                quantity=item["quantity"],
                unit_price=item["unit_price"],
                line_total=item["unit_price"] * item["quantity"],
            )
            for item in items_data
        ]
    )

    return order


def list_orders(user):
    return Order.objects.filter(user=user).prefetch_related("items", "status_history")


def get_order(user, order_id):
    return (
        Order.objects.filter(user=user, pk=order_id)
        .prefetch_related("items", "status_history")
        .first()
    )
