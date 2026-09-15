"""
Project-wide password complexity policy.

This is registered in AUTH_PASSWORD_VALIDATORS (see config/settings.py), so
it runs everywhere Django's ``validate_password()`` is called — registration,
password reset and change password all go through the serializers in
accounts/serializers.py, which means one policy, defined once, with no
per-endpoint copies to drift apart.

The frontend mirrors these rules in ``evaluatePassword()``
(tracker-main/src/lib/utils.ts) purely so the user gets live feedback while
typing; this validator remains the final authority. Keep the two in sync.
"""

import re

from django.core.exceptions import ValidationError
from django.utils.translation import gettext as _

#: Upper bound on password length. The lower bound is owned by Django's
#: MinimumLengthValidator (configured in settings) so it isn't defined twice.
PASSWORD_MAX_LENGTH = 12

#: "Special" is anything that is not an ASCII letter or digit — the same
#: definition the frontend checklist uses.
_SPECIAL_RE = re.compile(r"[^A-Za-z0-9]")


class PasswordComplexityValidator:
    """Requires a lowercase letter, an uppercase letter, a digit, a special
    character, and a length no greater than ``max_length``. Uppercase
    characters are allowed AND required — do not remove this check without
    also updating the frontend's evaluatePassword() in
    tracker-main/src/lib/utils.ts."""

    def __init__(self, max_length=PASSWORD_MAX_LENGTH):
        self.max_length = max_length

    def validate(self, password, user=None):
        errors = []

        if len(password) > self.max_length:
            errors.append(
                ValidationError(
                    _("This password is too long. It must contain at most %(max_length)d characters.")
                    % {"max_length": self.max_length},
                    code="password_too_long",
                    params={"max_length": self.max_length},
                )
            )
        if not re.search(r"[a-z]", password):
            errors.append(
                ValidationError(
                    _("This password must contain at least one lowercase letter."),
                    code="password_no_lower",
                )
            )
        if not re.search(r"[A-Z]", password):
            errors.append(
                ValidationError(
                    _("This password must contain at least one uppercase letter."),
                    code="password_no_upper",
                )
            )
        if not re.search(r"[0-9]", password):
            errors.append(
                ValidationError(
                    _("This password must contain at least one number."),
                    code="password_no_digit",
                )
            )
        if not _SPECIAL_RE.search(password):
            errors.append(
                ValidationError(
                    _("This password must contain at least one special character."),
                    code="password_no_special",
                )
            )

        if errors:
            raise ValidationError(errors)

    def get_help_text(self):
        return _(
            "Your password must contain at most %(max_length)d characters, including at least "
            "one lowercase letter, one uppercase letter, one number and one special character."
        ) % {"max_length": self.max_length}
