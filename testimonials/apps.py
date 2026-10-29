from django.apps import AppConfig


class TestimonialsConfig(AppConfig):
    default_auto_field = "django.db.models.BigAutoField"
    name = "testimonials"

    def ready(self):
        from . import signals  # noqa: F401
