from django.db import models


class Statistic(models.Model):
    """
    Marketing statistics (NOT real analytics), e.g. '10K+ Happy Customers'.
    `page` distinguishes the Home page stats bar from the About page stats
    showcase, since the two show different numbers today.
    """

    class Page(models.TextChoices):
        HOME = "home", "Home"
        ABOUT = "about", "About"

    page = models.CharField(max_length=20, choices=Page.choices, default=Page.HOME)
    value = models.CharField(max_length=50, help_text="e.g. 10K+, 99.9%")
    label = models.CharField(max_length=150, help_text="e.g. Happy Customers")
    icon = models.CharField(max_length=50, blank=True, default="", help_text="Optional Lucide icon name")
    display_order = models.PositiveIntegerField(default=0)
    is_active = models.BooleanField(default=True)

    class Meta:
        ordering = ["page", "display_order", "id"]
        verbose_name = "Statistic"
        verbose_name_plural = "Statistics"

    def __str__(self):
        return f"[{self.page}] {self.value} {self.label}"
