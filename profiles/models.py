from django.conf import settings
from django.core.exceptions import ValidationError
from django.core.validators import URLValidator
from django.db import models
from django.utils.text import slugify

from common.templates import DEFAULT_TEMPLATE, TEMPLATE_CHOICES

GOOGLE_MAPS_URL_MARKERS = ("google.com/maps", "maps.google.", "goo.gl/maps", "maps.app.goo.gl")


def validate_google_maps_url(value):
    """Must be a well-formed URL that's recognizably a Google Maps link —
    loose on purpose (Google Maps links come from many regional domains and
    shortened goo.gl forms), just enough to catch an unrelated URL."""
    if not value:
        return
    URLValidator()(value)
    if not any(marker in value.lower() for marker in GOOGLE_MAPS_URL_MARKERS):
        raise ValidationError("Enter a valid Google Maps link.")


SOCIAL_PLATFORMS = [
    "LinkedIn",
    "Instagram",
    "Facebook",
    "WhatsApp",
    "YouTube",
    "Twitter",
    "GitHub",
    "Telegram",
    "Website",
]


class Profile(models.Model):
    class Status(models.TextChoices):
        ACTIVE = "ACTIVE", "Active"
        SUSPENDED = "SUSPENDED", "Suspended"

    user = models.OneToOneField(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="profile"
    )
    username = models.SlugField(max_length=60, unique=True, db_index=True)
    designation = models.CharField(max_length=150, blank=True)
    company = models.CharField(max_length=150, blank=True)
    alternate_phone = models.CharField(max_length=20, blank=True)
    website = models.URLField(blank=True)
    address = models.CharField(max_length=255, blank=True)
    city = models.CharField(max_length=100, blank=True)
    state = models.CharField(max_length=100, blank=True)
    country = models.CharField(max_length=100, blank=True)
    google_maps_url = models.URLField(blank=True, validators=[validate_google_maps_url])
    bio = models.TextField(blank=True)
    avatar = models.ImageField(upload_to="profile_avatars/", null=True, blank=True)
    cover_image = models.ImageField(upload_to="profile_covers/", null=True, blank=True)
    status = models.CharField(max_length=10, choices=Status.choices, default=Status.ACTIVE)

    # The one profile-card visual template this customer has chosen, from
    # among the templates their purchased plan entitles them to (see
    # common.templates / orders.services.get_allowed_templates). Selected in
    # the QR Code page and used by both the QR-page preview and the public
    # profile — a single field so there's exactly one source of truth.
    selected_template = models.CharField(max_length=30, choices=TEMPLATE_CHOICES, default=DEFAULT_TEMPLATE)

    # Per-profile privacy settings (replaces the frontend's single global
    # client-side store — each customer's visibility is now their own).
    profile_public = models.BooleanField(default=True)
    show_contact_info = models.BooleanField(default=True)
    show_in_search = models.BooleanField(default=True)

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self):
        return self.username

    @property
    def public_url_path(self):
        return f"/u/{self.username}"

    @staticmethod
    def _unique_username(base):
        base = slugify(base) or "user"
        base = base[:50]
        candidate = base
        suffix = 1
        while Profile.objects.filter(username=candidate).exists():
            suffix += 1
            candidate = f"{base}{suffix}"
        return candidate

    @classmethod
    def ensure_for_user(cls, user):
        """
        Idempotent get-or-create, mirroring the frontend's previous
        ensureCustomerProfile() pattern: safe to call on every
        verify-email/login without creating duplicates.
        """
        profile = getattr(user, "profile", None)
        if profile is not None:
            return profile

        username = cls._unique_username(user.full_name or user.email.split("@")[0])
        profile = cls.objects.create(user=user, username=username)

        SocialLink.objects.bulk_create(
            [
                SocialLink(profile=profile, platform=platform, url="", enabled=False, display_order=i)
                for i, platform in enumerate(SOCIAL_PLATFORMS)
            ]
        )
        return profile


class SocialLink(models.Model):
    PLATFORM_CHOICES = [(p, p) for p in SOCIAL_PLATFORMS]

    profile = models.ForeignKey(Profile, on_delete=models.CASCADE, related_name="social_links")
    platform = models.CharField(max_length=20, choices=PLATFORM_CHOICES)
    url = models.URLField(blank=True)
    enabled = models.BooleanField(default=False)
    display_order = models.PositiveIntegerField(default=0)

    class Meta:
        unique_together = ("profile", "platform")
        ordering = ["display_order", "id"]

    def __str__(self):
        return f"{self.profile.username} / {self.platform}"


class CustomLink(models.Model):
    profile = models.ForeignKey(Profile, on_delete=models.CASCADE, related_name="custom_links")
    label = models.CharField(max_length=100)
    url = models.URLField()
    enabled = models.BooleanField(default=True)
    display_order = models.PositiveIntegerField(default=0)

    class Meta:
        ordering = ["display_order", "id"]

    def __str__(self):
        return f"{self.profile.username} / {self.label}"


class CustomField(models.Model):
    profile = models.ForeignKey(Profile, on_delete=models.CASCADE, related_name="custom_fields")
    label = models.CharField(max_length=100)
    value = models.CharField(max_length=255)
    display_order = models.PositiveIntegerField(default=0)

    class Meta:
        ordering = ["display_order", "id"]

    def __str__(self):
        return f"{self.profile.username} / {self.label}"
