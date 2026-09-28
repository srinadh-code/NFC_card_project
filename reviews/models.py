# The reviews app is retired: customer reviews now live in
# testimonials.Testimonial. Existing rows are copied over by
# testimonials/migrations/0002_import_customer_reviews.py, after which
# reviews/migrations/0002 drops the old table. The app stays in
# INSTALLED_APPS only so that migration history keeps applying cleanly on
# every environment; it can be removed once all deployments have migrated.
