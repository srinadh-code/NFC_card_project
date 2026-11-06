from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [("payments", "0005_checkoutsession_recipients")]
    operations = [migrations.AddField(model_name="checkoutsession", name="delivery_phone", field=models.CharField(blank=True, default="", max_length=20))]
