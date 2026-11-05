from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        ('orders', '0014_alter_order_payment_method_alter_transaction_method'),
        ('nfc_cards', '0005_delete_retired_card_types'),
        ('profiles', '0010_merge_20260917_1605'),
    ]

    operations = [
        migrations.CreateModel(
            name='OrderRecipient',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('name', models.CharField(max_length=150)),
                ('email', models.EmailField(db_index=True, max_length=254)),
                ('invitation_status', models.CharField(choices=[('PENDING', 'Pending'), ('SENT', 'Sent'), ('ACCEPTED', 'Accepted'), ('EXPIRED', 'Expired'), ('FAILED', 'Failed')], default='PENDING', max_length=12)),
                ('invitation_sent_at', models.DateTimeField(blank=True, null=True)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('updated_at', models.DateTimeField(auto_now=True)),
                ('order', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='recipients', to='orders.order')),
                ('profile', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='order_recipients', to='profiles.profile')),
                ('assigned_card', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='recipient_assignments', to='nfc_cards.nfccard')),
                ('user', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='order_recipients', to=settings.AUTH_USER_MODEL)),
            ],
            options={
                'ordering': ['order', 'pk'],
                'constraints': [models.UniqueConstraint(fields=('order', 'email'), name='unique_order_recipient_email')],
            },
        ),
    ]
