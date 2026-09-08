from django.db import models


class Value(models.Model):
    """
    Shared 'Innovation / Simplicity / Trust / Excellence' cards.
    One dataset, rendered on both the Home page and the About page.
    """

    title = models.CharField(max_length=100)
    description = models.TextField()
    icon = models.CharField(max_length=50, help_text="Lucide icon name")
    display_order = models.PositiveIntegerField(default=0)
    is_active = models.BooleanField(default=True)

    class Meta:
        ordering = ["display_order", "id"]
        verbose_name = "Value"

    def __str__(self):
        return self.title
