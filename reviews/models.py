from django.conf import settings
from django.core.validators import MaxValueValidator, MinLengthValidator, MinValueValidator
from django.db import models


class Review(models.Model):
    """
    A customer's testimonial for the public website — distinct from
    website_content.Testimonial (admin-authored marketing copy with no
    customer link at all). This model is customer-submitted, tied to a real
    account, gated on having actually bought something, and moderated by an
    admin before it can appear publicly.

    One review per customer, enforced at the database level via
    OneToOneField (not just a ForeignKey + application-level check) — the
    strongest guarantee Django offers for "exactly zero or one of these per
    user": a second INSERT for the same user_id violates the column's own
    UNIQUE constraint, independent of anything the view layer does or gets
    bypassed on. See CustomerReviewAPIView in views.py for how create/update
    both funnel through get_or_create-style logic on top of this.

    `is_published` is the one, single source of truth for public visibility
    (see PublicReviewsAPIView) — there is no second status/visibility field
    anywhere else to keep in sync with this one.
    """

    user = models.OneToOneField(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="review"
    )
    rating = models.PositiveSmallIntegerField(validators=[MinValueValidator(1), MaxValueValidator(5)])
    # Defense in depth alongside the serializer's own explicit checks (which
    # are what actually runs on every API request) — max_length=500 also
    # sizes the DB column; MinLengthValidator only bites on full_clean(), not
    # a raw .save(), so it's a second layer, not the enforcement mechanism.
    review_text = models.TextField(max_length=500, validators=[MinLengthValidator(10)])

    # Defaults to False — moderation is opt-in, not opt-out. A brand-new
    # review never appears on the public site until an admin explicitly
    # enables it (see PART 4's "Set initial visibility according to the
    # agreed moderation behavior" — this is that agreement: nothing goes
    # live without a human looking at it first).
    is_published = models.BooleanField(default=False)

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-created_at"]

    def __str__(self):
        return f"{self.user.email} ({self.rating}★)"
