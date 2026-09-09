from django.db import migrations


def seed_general_settings(apps, schema_editor):
    """Seed the singleton row with the values currently hardcoded on the
    frontend, so switching the public site over to this API is a no-op
    visually — from here on, Admin Settings > General is the only place
    these values are edited."""
    GeneralSettings = apps.get_model("website_content", "GeneralSettings")
    if GeneralSettings.objects.exists():
        return
    GeneralSettings.objects.create(
        site_name="VR's NEXORA",
        site_email="support@vrsnexora.com",
        site_phone="+91 90000 12345",
        site_address="Hyderabad, Telangana, India",
        currency="INR",
        timezone="Asia/Kolkata",
        is_active=True,
    )


def noop_reverse(apps, schema_editor):
    pass


class Migration(migrations.Migration):

    dependencies = [
        ("website_content", "0003_generalsettings"),
    ]

    operations = [
        migrations.RunPython(seed_general_settings, noop_reverse),
    ]
