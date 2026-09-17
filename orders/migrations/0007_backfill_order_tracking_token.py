import uuid

from django.db import migrations


def backfill_tracking_tokens(apps, schema_editor):
    Order = apps.get_model("orders", "Order")
    for order in Order.objects.filter(tracking_token__isnull=True).only("id"):
        order.tracking_token = uuid.uuid4()
        order.save(update_fields=["tracking_token"])


def noop_reverse(apps, schema_editor):
    # Nothing to reverse — the field goes back to null (or is removed
    # entirely) when 0006/0008 are unapplied.
    pass


class Migration(migrations.Migration):

    dependencies = [
        ("orders", "0006_order_tracking_token"),
    ]

    operations = [
        migrations.RunPython(backfill_tracking_tokens, noop_reverse),
    ]
