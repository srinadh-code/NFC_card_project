from django.conf import settings
from django.db import models


class CustomerAddress(models.Model):
    """A customer's saved delivery address (the "address book"). Purely
    customer-controlled — never confused with website_content.GeneralSettings'
    office_* fields (the company's own dispatch address, admin-controlled;
    see that model's docstring). An order never holds a live FK to one of
    these — orders.models.Order.shipping_* is a one-time snapshot copied
    from whichever CustomerAddress was selected at checkout (see
    orders.services.compose_shipping_snapshot), so editing or deleting an
    address here never changes any existing order's delivery address."""

    customer = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="addresses")

    # Free-text tag ("Home"/"Office"/"Other") — display-only, not an enum,
    # since customers may want any label.
    label = models.CharField(max_length=30, blank=True, default="")

    full_name = models.CharField(max_length=150)
    phone = models.CharField(max_length=20)
    address_line1 = models.CharField(max_length=255)
    address_line2 = models.CharField(max_length=255, blank=True, default="")
    landmark = models.CharField(max_length=100, blank=True, default="")
    # Village / Locality / Area — optional finer-grained locality, distinct
    # from city/district (rural Indian addresses often need all three).
    locality = models.CharField(max_length=100, blank=True, default="")
    city = models.CharField(max_length=100)
    district = models.CharField(max_length=100)
    state = models.CharField(max_length=100)
    pincode = models.CharField(max_length=6)
    country = models.CharField(max_length=100, default="India")

    is_default = models.BooleanField(default=False)

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-is_default", "-updated_at"]
        verbose_name = "Customer Address"
        verbose_name_plural = "Customer Addresses"

    def __str__(self):
        return f"{self.label or 'Address'} — {self.customer.email}"

    def save(self, *args, **kwargs):
        # Exactly one default per customer — setting this one default
        # silently un-defaults any previous one, rather than requiring a
        # separate "unset old default" API call from the frontend.
        if self.is_default:
            CustomerAddress.objects.filter(customer=self.customer, is_default=True).exclude(pk=self.pk).update(
                is_default=False
            )
        super().save(*args, **kwargs)
