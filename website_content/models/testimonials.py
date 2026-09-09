from django.core.validators import MaxValueValidator, MinValueValidator
from django.db import models


class Testimonial(models.Model):
    """Customer testimonials shown on the Home page."""

    name = models.CharField(max_length=150)
    designation = models.CharField(max_length=150, blank=True, default="")
    company = models.CharField(max_length=150, blank=True, default="")
    review = models.TextField()
    rating = models.PositiveSmallIntegerField(
        default=5,
        validators=[MinValueValidator(1), MaxValueValidator(5)],
    )

    image_url = models.URLField(max_length=500, blank=True, default="")
    image_public_id = models.CharField(max_length=255, blank=True, default="")

    display_order = models.PositiveIntegerField(default=0)
    is_active = models.BooleanField(default=True)

    class Meta:
        ordering = ["display_order", "id"]
        verbose_name = "Testimonial"

    def __str__(self):
        return self.name
