from django.db import models


class HowItWorksStep(models.Model):
    """The numbered steps on the How It Works page."""

    step_number = models.PositiveIntegerField(default=1)
    icon = models.CharField(max_length=50, help_text="Lucide icon name")
    title = models.CharField(max_length=150)
    description = models.TextField()
    display_order = models.PositiveIntegerField(default=0)
    is_active = models.BooleanField(default=True)

    class Meta:
        ordering = ["display_order", "id"]
        verbose_name = "How It Works Step"

    def __str__(self):
        return f"{self.step_number}. {self.title}"
