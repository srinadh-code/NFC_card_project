from django.db import migrations, models


def check_card_links(apps, schema_editor):
    Recipient = apps.get_model("orders", "OrderRecipient")
    duplicates = (Recipient.objects.using(schema_editor.connection.alias)
                  .exclude(assigned_card_id=None).values("assigned_card_id")
                  .annotate(count=models.Count("pk")).filter(count__gt=1))
    if duplicates.exists():
        raise RuntimeError("Duplicate recipient card assignments exist. Reconcile those links before applying orders.0018; no records were removed.")


class Migration(migrations.Migration):
    dependencies = [("orders", "0017_make_orderrecipient_phone_nullable")]
    operations = [
        migrations.RemoveConstraint(model_name="orderrecipient", name="unique_order_recipient_email"),
        migrations.RunPython(check_card_links, migrations.RunPython.noop),
        migrations.AddConstraint(model_name="orderrecipient", constraint=models.UniqueConstraint(fields=("assigned_card",), condition=models.Q(assigned_card__isnull=False), name="unique_recipient_physical_card")),
        migrations.AddField(model_name="order", name="purchaser_name", field=models.CharField(blank=True, default="", max_length=150)),
        migrations.AddField(model_name="order", name="purchaser_email", field=models.EmailField(blank=True, default="", max_length=254)),
        migrations.AddField(model_name="order", name="purchaser_phone", field=models.CharField(blank=True, default="", max_length=20)),
        migrations.AddField(model_name="order", name="delivery_phone", field=models.CharField(blank=True, default="", max_length=20)),
    ]
