from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('payments', '0004_checkoutsession_provider'),
    ]

    operations = [
        migrations.AddField(
            model_name='checkoutsession',
            name='recipients',
            field=models.JSONField(blank=True, default=list),
        ),
    ]
