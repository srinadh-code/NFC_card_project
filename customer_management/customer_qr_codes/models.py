from django.db import models


class CustomerQrCode(models.Model):
    """One generated QR image per customer profile, pointing at their public profile URL."""

    profile = models.OneToOneField(
        "profiles.Profile", on_delete=models.CASCADE, related_name="qr_code"
    )
    image = models.ImageField(upload_to="qr_codes/")
    target_url = models.URLField()
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self):
        return f"QR for {self.profile.username}"
