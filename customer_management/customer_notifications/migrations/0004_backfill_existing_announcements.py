from django.db import migrations, models


def backfill_existing_announcements(apps, schema_editor):
    """Every row that existed before this feature was added was sent
    immediately, to customers only, under the old "send now" behaviour —
    display_location/announcement_type already default to CUSTOMER/GENERAL,
    which is correct for them. This just marks them as published (so they
    show "Published", not "Draft", in the admin list) and already-notified
    (notified_at = created_at, so sync_due_customer_announcements never
    tries to re-send a years-old announcement to every customer)."""
    Announcement = apps.get_model("customer_notifications", "Announcement")
    Announcement.objects.filter(is_published=False, notified_at__isnull=True).update(
        is_published=True, notified_at=models.F("created_at")
    )


def noop_reverse(apps, schema_editor):
    pass


class Migration(migrations.Migration):

    dependencies = [
        ("customer_notifications", "0003_announcement_announcement_type_announcement_cta_link_and_more"),
    ]

    operations = [
        migrations.RunPython(backfill_existing_announcements, noop_reverse),
    ]
