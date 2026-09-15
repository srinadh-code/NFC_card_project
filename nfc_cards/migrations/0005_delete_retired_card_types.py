# Generated for the NEXORA Classic / NEXORA Premium retirement.
#
# Unlike the earlier rename migrations in this app, this one is a genuine
# data purge, not a rename: CLASSIC and PREMIUM stop being valid card types
# entirely, and any existing NfcCard rows holding those values are deleted
# (per explicit product decision — Classic/Premium cards are being retired,
# not merely stopped from new sale). The reverse operation is a no-op, not
# an undo: unapplying this migration restores the CLASSIC/PREMIUM choices
# but the deleted rows are gone for good.

from django.db import migrations, models


def delete_retired_cards(apps, schema_editor):
    NfcCard = apps.get_model("nfc_cards", "NfcCard")
    NfcCard.objects.filter(card_type__in=["CLASSIC", "PREMIUM"]).delete()


class Migration(migrations.Migration):

    dependencies = [
        ("nfc_cards", "0004_alter_nfccard_card_type"),
    ]

    operations = [
        migrations.RunPython(delete_retired_cards, migrations.RunPython.noop),
        migrations.AlterField(
            model_name="nfccard",
            name="card_type",
            field=models.CharField(
                choices=[
                    ("WOODEN", "Wooden"),
                    ("CUSTOM", "Custom"),
                ],
                default="CUSTOM",
                max_length=10,
            ),
        ),
    ]
