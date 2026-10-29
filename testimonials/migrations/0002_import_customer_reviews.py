"""
Carries over real, customer-submitted reviews.Review rows into Testimonial
before the old reviews table is dropped (reviews/migrations/0002). These are
genuine customer submissions, not demo data — so they're preserved, not
discarded.

Mapping:
  user            -> customer
  review_text     -> review
  rating          -> rating
  is_published    -> status APPROVED (True) / PENDING (False)
  full_name       -> name (the old model had no name/designation/company)
  created_at      -> created_at (restored after insert; auto_now_add would
                     otherwise stamp the migration time)
  order           -> customer's most recent PAID order, else most recent
                     order of any status, else NULL

The old reviews model had one review per user, so the "one pending
testimonial per customer" constraint can't be violated here.

Reverse is a no-op: reviews.Review data is not recreated.
"""

from django.db import migrations


def import_reviews(apps, schema_editor):
    Review = apps.get_model("reviews", "Review")
    Testimonial = apps.get_model("testimonials", "Testimonial")
    Order = apps.get_model("orders", "Order")

    for review in Review.objects.select_related("user").iterator():
        user = review.user
        orders = Order.objects.filter(customer_id=user.id).order_by("-placed_at")
        order = orders.filter(payment_status="PAID").first() or orders.first()

        testimonial = Testimonial.objects.create(
            customer_id=user.id,
            order_id=order.id if order else None,
            name=(user.full_name or "").strip() or "Verified Customer",
            rating=review.rating,
            review=review.review_text,
            status="APPROVED" if review.is_published else "PENDING",
            is_active=True,
        )
        Testimonial.objects.filter(pk=testimonial.pk).update(
            created_at=review.created_at, updated_at=review.updated_at
        )


def remove_imported(apps, schema_editor):
    # Nothing distinguishes imported rows from later ones once the reviews
    # table is gone, so the reverse is a no-op rather than a guess.
    pass


class Migration(migrations.Migration):

    dependencies = [
        ("testimonials", "0001_initial"),
        ("reviews", "0001_initial"),
        ("orders", "0009_merge_20260918_1024"),
    ]

    operations = [
        migrations.RunPython(import_reviews, remove_imported),
    ]
