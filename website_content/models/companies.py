from django.db import models


class Company(models.Model):
    """'Trusted by Professionals' logo strip on the Home page."""

    name = models.CharField(max_length=150)
    logo_url = models.URLField(max_length=500, blank=True, default="")
    logo_public_id = models.CharField(max_length=255, blank=True, default="")
    display_order = models.PositiveIntegerField(default=0)
    # Publication is an explicit admin decision after business verification.
    is_active = models.BooleanField(default=False)

    class Meta:
        ordering = ["display_order", "id"]
        verbose_name = "Company"
        verbose_name_plural = "Companies"

    def __str__(self):
        return self.name
