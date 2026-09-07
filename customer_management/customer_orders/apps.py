from django.apps import AppConfig


class CustomerOrdersConfig(AppConfig):
    name = "customer_management.customer_orders"
    label = "customer_orders"
    verbose_name = "Customer Orders"

    def ready(self):
        from . import signals  # noqa: F401
