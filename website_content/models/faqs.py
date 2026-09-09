from django.db import models


class Faq(models.Model):
    """
    Single FAQ source of truth. The Home page FAQ preview and the full FAQ
    page both read from this same table (Home just slices the first N).
    """

    question = models.CharField(max_length=500)
    answer = models.TextField()
    display_order = models.PositiveIntegerField(default=0)
    is_active = models.BooleanField(default=True)

    class Meta:
        ordering = ["display_order", "id"]
        verbose_name = "FAQ"
        verbose_name_plural = "FAQs"

    def __str__(self):
        return self.question
