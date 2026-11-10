from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [("accounts", "0006_alter_emailotp_purpose")]

    operations = [
        migrations.AlterField(
            model_name="emailotp",
            name="purpose",
            field=models.CharField(
                choices=[
                    ("REGISTER", "Register"),
                    ("RESET", "Password Reset"),
                    ("ACTIVATE", "Account Activation"),
                    ("PURCHASER", "Purchaser Account Setup"),
                ],
                max_length=10,
            ),
        ),
    ]
