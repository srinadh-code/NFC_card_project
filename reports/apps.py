from django.apps import AppConfig


class ReportsConfig(AppConfig):
    """Domain app holding the one durable record of admin report generation
    (GeneratedReport). The reports *data* itself (sales/orders/customers/tap
    analytics) is computed live from other apps' models on every request —
    see admin_api/reports — this app only remembers that a report was
    generated, by whom, and when, so "Recent Reports" in the admin UI is
    real history instead of a local-only mock."""

    default_auto_field = "django.db.models.BigAutoField"
    name = "reports"
