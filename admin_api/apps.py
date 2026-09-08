from django.apps import AppConfig


class AdminApiConfig(AppConfig):
    """Not a domain app — carries no models of its own. Holds every
    admin-only serializer/view, organized one subpackage per Admin page
    (customers, cards, profiles, orders, transactions, support, analytics,
    reports) plus the dashboard summary, all operating on the domain models
    in accounts/profiles/nfc_cards/orders/support/analytics.

    Named `admin_api` (not bare `admin`) to avoid any ambiguity with
    django.contrib.admin, which this project also uses for the Django admin
    site at /admin/.
    """

    default_auto_field = "django.db.models.BigAutoField"
    name = "admin_api"
    label = "admin_api"
