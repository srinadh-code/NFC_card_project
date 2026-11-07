from django.db import migrations, models
import django.db.models.deletion


def backfill_existing_allocations(apps, schema_editor):
    Recipient = apps.get_model("orders", "OrderRecipient")
    Allocation = apps.get_model("orders", "RecipientEmailAllocation")
    database = schema_editor.connection.alias
    for recipient in Recipient.objects.using(database).filter(assigned_card__isnull=False).select_related(
        "order__customer"
    ).order_by("pk"):
        normalized_email = recipient.email.strip().lower()
        allocation, _ = Allocation.objects.using(database).get_or_create(
            normalized_email=normalized_email,
            defaults={
                "owner_email": (recipient.order.purchaser_email or recipient.order.customer.email).strip().lower(),
            },
        )
        recipient.email_allocation_id = allocation.pk
        recipient.save(using=database, update_fields=["email_allocation"])


class Migration(migrations.Migration):
    dependencies = [
        ("orders", "0018_recipient_allocations_and_contacts"),
    ]

    operations = [
        migrations.CreateModel(
            name="RecipientEmailAllocation",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("normalized_email", models.EmailField(max_length=254, unique=True)),
                ("owner_email", models.EmailField(max_length=254)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
            ],
        ),
        migrations.AddField(
            model_name="orderrecipient",
            name="email_allocation",
            field=models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name="recipients", to="orders.recipientemailallocation"),
        ),
        migrations.CreateModel(
            name="RecipientEmailReservation",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("checkout_session_id", models.UUIDField(db_index=True)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("allocation", models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name="reservations", to="orders.recipientemailallocation")),
            ],
        ),
        migrations.AddConstraint(
            model_name="recipientemailreservation",
            constraint=models.UniqueConstraint(fields=("allocation", "checkout_session_id"), name="unique_recipient_email_checkout_reservation"),
        ),
        migrations.RunPython(backfill_existing_allocations, migrations.RunPython.noop),
    ]
