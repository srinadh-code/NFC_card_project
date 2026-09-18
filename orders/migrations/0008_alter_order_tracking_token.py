import uuid

from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("orders", "0007_backfill_order_tracking_token"),
    ]

    operations = [
        migrations.AlterField(
            model_name="order",
            name="tracking_token",
            field=models.UUIDField(default=uuid.uuid4, unique=True, editable=False, db_index=True),
        ),
    ]
