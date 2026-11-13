from django.db import migrations, models


def unpublish_until_reviewed(apps, schema_editor):
    """Preserve every company row/asset; publication requires business review.

    This runs once on existing installations. Reversing must not silently
    re-publish unverified relationships or overwrite later admin decisions.
    """
    Company = apps.get_model("website_content", "Company")
    Company.objects.using(schema_editor.connection.alias).filter(is_active=True).update(is_active=False)


class Migration(migrations.Migration):
    dependencies = [("website_content", "0020_order_card_product_details")]

    operations = [
        migrations.RunPython(unpublish_until_reviewed, migrations.RunPython.noop),
        migrations.AlterField(
            model_name="company",
            name="is_active",
            field=models.BooleanField(default=False),
        ),
    ]
