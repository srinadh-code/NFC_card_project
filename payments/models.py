import uuid

from django.conf import settings
from django.db import models


class CheckoutSession(models.Model):
    """One Razorpay payment attempt. Holds everything needed to create the
    real order once the payment is verified — the buyer's contact details
    and delivery address (guest checkout) or the signed-in customer, and the
    server-priced line snapshot. The amount charged by Razorpay is fixed
    here, so the order created at fulfilment always matches it.

    No Order and no customer account exist for a session until it is paid:
    payments.services.fulfill_checkout creates both, exactly once, whether
    it's triggered by the browser's verify call or by the Razorpay webhook.
    """

    class Status(models.TextChoices):
        CREATED = "CREATED", "Awaiting payment"
        FAILED = "FAILED", "Payment failed"
        FULFILLED = "FULFILLED", "Paid and fulfilled"

    class Provider(models.TextChoices):
        RAZORPAY = "RAZORPAY", "Razorpay"
        DUMMY = "DUMMY", "Dummy / Test Payment"

    provider = models.CharField(max_length=10, choices=Provider.choices, default=Provider.RAZORPAY)
    public_id = models.UUIDField(default=uuid.uuid4, unique=True, editable=False)
    customer = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True, related_name="checkout_sessions"
    )

    email = models.EmailField()
    full_name = models.CharField(max_length=150)
    phone = models.CharField(max_length=20)
    # How the buyer was verified before paying (payments/verification.py).
    # A signed-in customer's email is already verified on their account.
    email_verified = models.BooleanField(default=False)
    phone_verified = models.BooleanField(default=False)

    address_line1 = models.CharField(max_length=255)
    address_line2 = models.CharField(max_length=255, blank=True, default="")
    landmark = models.CharField(max_length=100, blank=True, default="")
    locality = models.CharField(max_length=100, blank=True, default="")
    city = models.CharField(max_length=100)
    district = models.CharField(max_length=100)
    state = models.CharField(max_length=100)
    pincode = models.CharField(max_length=6)
    country = models.CharField(max_length=100, default="India")
    latitude = models.DecimalField(max_digits=9, decimal_places=6, null=True, blank=True)
    longitude = models.DecimalField(max_digits=9, decimal_places=6, null=True, blank=True)

    # Server-priced line snapshot (payments.services.serialize_priced_lines).
    lines = models.JSONField(default=list)
    promo_code = models.CharField(max_length=50, blank=True, default="")
    subtotal = models.DecimalField(max_digits=10, decimal_places=2)
    first_order_discount_percentage = models.DecimalField(max_digits=5, decimal_places=2, null=True, blank=True)
    first_order_discount_amount = models.DecimalField(max_digits=10, decimal_places=2, null=True, blank=True)
    amount = models.DecimalField(max_digits=10, decimal_places=2)
    shipping = models.DecimalField(max_digits=10, decimal_places=2, default=0)
    currency = models.CharField(max_length=3, default="INR")

    razorpay_order_id = models.CharField(max_length=64, unique=True, null=True, blank=True)
    razorpay_payment_id = models.CharField(max_length=64, unique=True, null=True, blank=True)

    status = models.CharField(max_length=10, choices=Status.choices, default=Status.CREATED, db_index=True)
    order = models.OneToOneField(
        "orders.Order", on_delete=models.SET_NULL, null=True, blank=True, related_name="checkout_session"
    )
    fulfilled_via = models.CharField(max_length=10, blank=True, default="")  # "verify" or "webhook"
    paid_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-created_at"]

    def __str__(self):
        return f"Checkout {self.public_id} ({self.status})"

    @property
    def total(self):
        return self.amount + self.shipping

    @property
    def amount_paise(self):
        return int((self.total * 100).to_integral_value())


class CheckoutVerification(models.Model):
    """One OTP challenge for a guest's email or mobile number before
    checkout (payments/verification.py). The code and the resulting
    verification token are stored only as HMACs — never readable, never
    shown in the admin."""

    class Channel(models.TextChoices):
        EMAIL = "EMAIL", "Email"
        SMS = "SMS", "Mobile"

    channel = models.CharField(max_length=5, choices=Channel.choices)
    destination = models.CharField(max_length=254, db_index=True)
    # Random id of the browser checkout this verification belongs to — the
    # code, and the token it yields, only work for that same checkout.
    session_ref = models.CharField(max_length=64, blank=True, default="")
    code_hash = models.CharField(max_length=64, blank=True, default="")
    expires_at = models.DateTimeField()
    attempts = models.PositiveSmallIntegerField(default=0)
    verified_at = models.DateTimeField(null=True, blank=True)
    token_hash = models.CharField(max_length=64, blank=True, default="", db_index=True)
    token_expires_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at"]

    def __str__(self):
        return f"{self.get_channel_display()} verification ({'verified' if self.verified_at else 'pending'})"
