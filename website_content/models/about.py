from django.db import models


class AboutPage(models.Model):
    """Singleton — About page header + 'Our Story' copy. Keep only one row."""

    page_title = models.CharField(max_length=200, default="About VR's NEXORA")
    page_subtitle = models.TextField(blank=True, default="")

    story_badge = models.CharField(max_length=100, blank=True, default="OUR STORY")
    story_title = models.CharField(max_length=200, blank=True, default="")
    story_paragraph_1 = models.TextField(blank=True, default="")
    story_paragraph_2 = models.TextField(blank=True, default="")

    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = "About Page"
        verbose_name_plural = "About Page"

    def __str__(self):
        return self.page_title


class AboutFeatureHighlight(models.Model):
    """Story feature checklist, e.g. 'One Tap Sharing', 'NFC Technology'."""

    label = models.CharField(max_length=150)
    icon = models.CharField(max_length=50, help_text="Lucide icon name")
    display_order = models.PositiveIntegerField(default=0)
    is_active = models.BooleanField(default=True)

    class Meta:
        ordering = ["display_order", "id"]
        verbose_name = "About Story Feature Highlight"

    def __str__(self):
        return self.label


class AboutMission(models.Model):
    """Singleton — the 'Our Mission' showcase section."""

    badge = models.CharField(max_length=150, blank=True, default="OUR MISSION")
    heading = models.CharField(max_length=255, blank=True, default="")
    description = models.TextField(blank=True, default="")
    is_active = models.BooleanField(default=True)

    class Meta:
        verbose_name = "About Mission"
        verbose_name_plural = "About Mission"

    def __str__(self):
        return self.heading or "Our Mission"


class AboutWhyChoose(models.Model):
    """'Why Choose VR's NEXORA' cards."""

    title = models.CharField(max_length=150)
    description = models.TextField()
    icon = models.CharField(max_length=50, help_text="Lucide icon name")
    gradient = models.CharField(max_length=255, blank=True, default="", help_text="Optional CSS gradient")
    display_order = models.PositiveIntegerField(default=0)
    is_active = models.BooleanField(default=True)

    class Meta:
        ordering = ["display_order", "id"]
        verbose_name = "About Why Choose"

    def __str__(self):
        return self.title


class AboutBuiltFromExperience(models.Model):
    """Singleton — the 'Built From Experience' section, including its image."""

    heading = models.CharField(max_length=255, blank=True, default="Built From Experience")
    subtitle = models.TextField(blank=True, default="")
    paragraph_1 = models.TextField(blank=True, default="")
    paragraph_2 = models.TextField(blank=True, default="")

    image_url = models.URLField(max_length=500, blank=True, default="")
    image_public_id = models.CharField(max_length=255, blank=True, default="")

    is_active = models.BooleanField(default=True)

    class Meta:
        verbose_name = "About Built From Experience"
        verbose_name_plural = "About Built From Experience"

    def __str__(self):
        return self.heading or "Built From Experience"
