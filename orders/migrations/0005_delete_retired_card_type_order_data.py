# Companion to nfc_cards.0005_delete_retired_card_types — deletes OrderItem
# rows for the retired NEXORA Classic / NEXORA Premium card types, and any
# Order left with zero items as a result (which cascades to delete that
# order's Transaction rows too, per Transaction.order's on_delete=CASCADE).
# An order that also had Custom/Wooden items keeps those items and is left
# otherwise alone. Irreversible — the reverse operation is a no-op, not an
# undo.

from django.db import migrations


def delete_retired_order_data(apps, schema_editor):
    OrderItem = apps.get_model("orders", "OrderItem")
    Order = apps.get_model("orders", "Order")

    OrderItem.objects.filter(card_type__in=["CLASSIC", "PREMIUM"]).delete()
    Order.objects.filter(items__isnull=True).delete()


class Migration(migrations.Migration):

    dependencies = [
        ("orders", "0004_rename_metal_card_type_to_custom"),
    ]

    operations = [
        migrations.RunPython(delete_retired_order_data, migrations.RunPython.noop),
    ]
