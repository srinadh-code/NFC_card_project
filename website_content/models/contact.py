from django.db import models


class ContactMessage(models.Model):
    """Submissions from the public Contact page form."""

    name = models.CharField(max_length=150)
    email = models.EmailField()
    subject = models.CharField(max_length=255)
    message = models.TextField()

    is_read = models.BooleanField(default=False)
    is_resolved = models.BooleanField(default=False)

    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at"]
        verbose_name = "Contact Message"

    def __str__(self):
        return f"{self.name} <{self.email}>: {self.subject}"
