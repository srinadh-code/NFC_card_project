from django.conf import settings
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


class ContactMessageReply(models.Model):
    """An admin's reply to a submitted contact message."""

    message = models.ForeignKey(
        ContactMessage,
        related_name="replies",
        on_delete=models.CASCADE,
    )

    content = models.TextField()

    # Nullable: preserves the reply if the admin account is later removed,
    # rather than deleting reply history.
    admin = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        related_name="contact_message_replies",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
    )

    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["created_at"]
        verbose_name = "Contact Message Reply"

    def __str__(self):
        return f"Reply to #{self.message_id}"
