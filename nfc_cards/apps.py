from django.apps import AppConfig


class NfcCardsConfig(AppConfig):
    name = "nfc_cards"

    def ready(self):
        from . import signals  # noqa: F401
