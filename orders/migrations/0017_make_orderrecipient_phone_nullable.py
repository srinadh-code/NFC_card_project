import copy

from django.db import migrations, models


def enforce_nullable_phone(apps, schema_editor):
    model = apps.get_model("orders", "OrderRecipient")
    columns = {
        column.name: column
        for column in schema_editor.connection.introspection.get_table_description(
            schema_editor.connection.cursor(), model._meta.db_table
        )
    }
    if "phone" not in columns:
        field = models.CharField(max_length=20, null=True, blank=True, default="")
        field.set_attributes_from_name("phone")
        field.model = model
        schema_editor.add_field(model, field)
        return
    if not columns["phone"].null_ok:
        old_field = copy.copy(models.CharField(max_length=20))
        old_field.set_attributes_from_name("phone")
        old_field.model = model
        new_field = copy.copy(models.CharField(max_length=20, null=True, blank=True, default=""))
        new_field.set_attributes_from_name("phone")
        new_field.model = model
        schema_editor.alter_field(model, old_field, new_field, strict=False)


class Migration(migrations.Migration):
    dependencies = [
        ("orders", "0016_orderrecipient_phone_optional"),
    ]

    operations = [
        migrations.SeparateDatabaseAndState(
            state_operations=[
                migrations.AlterField(
                    model_name="orderrecipient",
                    name="phone",
                    field=models.CharField(blank=True, default="", max_length=20, null=True),
                ),
            ],
            database_operations=[
                migrations.RunPython(enforce_nullable_phone, migrations.RunPython.noop),
            ],
        ),
    ]
