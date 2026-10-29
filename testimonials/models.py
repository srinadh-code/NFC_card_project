from django.conf import settings
from django.core.validators import MaxValueValidator, MinLengthValidator, MinValueValidator
from django.db import models

REVIEW_MIN_LENGTH = 20
REVIEW_MAX_LENGTH = 1000


class Testimonial(models.Model):
    """
    A customer-submitted testimonial for the public website — the single
    source of truth for every testimonial the site shows. Replaces both the
    old admin-authored website_content.Testimonial (demo marketing copy with
    no customer link) and the one-per-user reviews.Review.

    Tied to a real account and a real order: creation is gated on the
    customer having at least one PAID order (see services.has_purchased_card).
    Nothing is public until an admin approves it — the public endpoint only
    ever returns status=APPROVED AND is_active=True.

    `status` is the moderation decision; `is_active` is an independent admin
    visibility switch, so an approved testimonial can be hidden temporarily
    without losing its approval.
    """

    class Status(models.TextChoices):
        PENDING = "PENDING", "Pending"
        APPROVED = "APPROVED", "Approved"
        REJECTED = "REJECTED", "Rejected"

    customer = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="testimonials"
    )
    # SET_NULL, not PROTECT: an admin removing an order must never be
    # blocked by (or silently delete) the customer's testimonial. The
    # purchase check already happened at creation time.
    order = models.ForeignKey(
        "orders.Order",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="testimonials",
    )

    # Cloudinary-hosted — same url + public_id pair every other uploaded
    # website image uses (see common/image_storage.py). public_id is what
    # lets a replace/delete clean up the old asset.
    profile_image = models.URLField(max_length=500, blank=True, default="")
    profile_image_public_id = models.CharField(max_length=255, blank=True, default="")

    name = models.CharField(max_length=150)
    designation = models.CharField(max_length=150, blank=True, default="")
    company = models.CharField(max_length=150, blank=True, default="")
    rating = models.PositiveSmallIntegerField(validators=[MinValueValidator(1), MaxValueValidator(5)])
    review = models.TextField(
        max_length=REVIEW_MAX_LENGTH, validators=[MinLengthValidator(REVIEW_MIN_LENGTH)]
    )

    status = models.CharField(max_length=10, choices=Status.choices, default=Status.PENDING, db_index=True)
    is_active = models.BooleanField(default=True)

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-created_at"]
        indexes = [
            # The public feed's exact filter + sort.
            models.Index(fields=["status", "is_active", "-created_at"], name="testimonial_public_idx"),
        ]
        constraints = [
            models.CheckConstraint(
                condition=models.Q(rating__gte=1) & models.Q(rating__lte=5),
                name="testimonial_rating_1_to_5",
            ),
            # At most one testimonial awaiting moderation per customer —
            # enforced by the database, not just the create view, so two
            # concurrent submissions can't both land.
            models.UniqueConstraint(
                fields=["customer"],
                condition=models.Q(status="PENDING"),
                name="one_pending_testimonial_per_customer",
            ),
        ]

    def __str__(self):
        return f"{self.name} ({self.rating}★, {self.status})"

    @property
    def is_editable_by_customer(self):
        return self.status == self.Status.PENDING
