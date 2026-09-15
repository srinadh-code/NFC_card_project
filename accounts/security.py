"""Real, admin-configurable security policy — reads the live
website_content.SecuritySettings singleton (Admin Settings > Security)
rather than a static list, so changing it in the admin UI actually changes
what's enforced on the next password set/change/reset. No caching: this
runs once per password submission, not once per process, so an admin's
change takes effect immediately without a restart."""

from django.core.exceptions import ValidationError as DjangoValidationError


def enforce_password_policy(value: str) -> None:
    from website_content.models import SecuritySettings

    settings_row = SecuritySettings.objects.first()
    if settings_row is None:
        return

    if len(value) < settings_row.min_password_length:
        raise DjangoValidationError(
            f"This password must be at least {settings_row.min_password_length} characters."
        )

    if settings_row.require_special_char and all(c.isalnum() for c in value):
        raise DjangoValidationError("This password must contain at least one special character.")


def access_token_minutes() -> int | None:
    """Admin-configured JWT access-token lifetime override, or None to fall
    back to the server's env-configured SIMPLE_JWT default."""
    from website_content.models import SecuritySettings

    settings_row = SecuritySettings.objects.first()
    if settings_row is None:
        return None
    return settings_row.access_token_minutes
