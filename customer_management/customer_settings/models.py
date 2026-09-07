from django.conf import settings
from django.db import models


class CustomerSettings(models.Model):
    class Language(models.TextChoices):
        EN = "en", "English"
        HI = "hi", "Hindi"
        TE = "te", "Telugu"

    user = models.OneToOneField(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="settings"
    )

    # Privacy
    show_email = models.BooleanField(default=True)
    show_phone = models.BooleanField(default=True)
    show_company = models.BooleanField(default=True)
    show_social_links = models.BooleanField(default=True)

    # Preferences
    language = models.CharField(max_length=10, choices=Language.choices, default=Language.EN)
    timezone = models.CharField(max_length=50, default="Asia/Kolkata")

    # Notification preferences
    notify_order_updates = models.BooleanField(default=True)
    notify_nfc_updates = models.BooleanField(default=True)
    notify_profile_views = models.BooleanField(default=False)
    notify_system_messages = models.BooleanField(default=True)

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self):
        return f"Settings for {self.user.email}"

    @classmethod
    def ensure_for_user(cls, user):
        settings_obj, _created = cls.objects.get_or_create(user=user)
        return settings_obj
