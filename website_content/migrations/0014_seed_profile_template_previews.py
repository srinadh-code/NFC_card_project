# Data migration: pre-populates one row per real "custom" tier template id
# (see common.templates.PLAN_TEMPLATES["custom"]) so the admin CRUD list
# starts with the 5 real slots already present instead of empty. Every row
# is seeded with a blank image_url, so this changes nothing a visitor sees —
# /shop keeps rendering its existing code-drawn mockups until an admin
# actually uploads an image for a row.
from django.db import migrations

TEMPLATE_IDS = ["luxury", "future", "nature", "glass", "impact"]


def seed(apps, schema_editor):
    ProfileTemplatePreview = apps.get_model("website_content", "ProfileTemplatePreview")

    if not ProfileTemplatePreview.objects.exists():
        for i, template_id in enumerate(TEMPLATE_IDS):
            ProfileTemplatePreview.objects.create(
                template_id=template_id,
                display_order=i,
                is_active=True,
            )


def unseed(apps, schema_editor):
    ProfileTemplatePreview = apps.get_model("website_content", "ProfileTemplatePreview")
    ProfileTemplatePreview.objects.filter(template_id__in=TEMPLATE_IDS).delete()


class Migration(migrations.Migration):

    dependencies = [
        ("website_content", "0013_profiletemplatepreview"),
    ]

    operations = [
        migrations.RunPython(seed, unseed),
    ]
