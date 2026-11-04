from rest_framework.exceptions import AuthenticationFailed
from rest_framework_simplejwt.authentication import JWTAuthentication


class ActivatedJWTAuthentication(JWTAuthentication):
    """The project's JWT authentication, refusing any account that still
    has to complete its mandatory first-login password change (accounts
    created from a paid guest checkout — see accounts/onboarding.py).

    Login never issues JWTs to such an account in the first place; this is
    the backend-wide backstop so no customer or admin API can be reached
    with a token minted before the account was put into that state."""

    def get_user(self, validated_token):
        user = super().get_user(validated_token)
        if getattr(user, "must_change_password", False):
            raise AuthenticationFailed("Please finish setting up your account password first.", code="password_change_required")
        return user
