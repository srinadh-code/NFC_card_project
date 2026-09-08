from django.db import models


class Feature(models.Model):
    """Features page cards (also usable anywhere else that lists features)."""

    icon = models.CharField(max_length=50, help_text="Lucide icon name")
    title = models.CharField(max_length=150)
    description = models.TextField()
    display_order = models.PositiveIntegerField(default=0)
    is_active = models.BooleanField(default=True)

    class Meta:
        ordering = ["display_order", "id"]
        verbose_name = "Feature"

    def __str__(self):
        return self.title
