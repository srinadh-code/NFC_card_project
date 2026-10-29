from django.db import migrations


def backfill_ever_published(apps, schema_editor):
    """Any row that's currently is_published=True has, by definition,
    already been published at least once — ever_published defaults to
    False for every row (including these, since the field didn't exist
    until the previous migration), so without this they'd misleadingly
    read as never-published if an admin later disabled them."""
    Announcement = apps.get_model("customer_notifications", "Announcement")
    Announcement.objects.filter(is_published=True, ever_published=False).update(ever_published=True)


def noop_reverse(apps, schema_editor):
    pass


class Migration(migrations.Migration):

    dependencies = [
        ("customer_notifications", "0005_announcement_applicable_card_types_and_more"),
    ]

    operations = [
        migrations.RunPython(backfill_ever_published, noop_reverse),
    ]
