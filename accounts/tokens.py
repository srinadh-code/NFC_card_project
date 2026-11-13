"""JWT issuance shared by login and refresh without changing response shapes."""

from datetime import timedelta

from rest_framework_simplejwt.tokens import RefreshToken

from .security import access_token_minutes


class ConfiguredRefreshToken(RefreshToken):
    @property
    def access_token(self):
        access = super().access_token
        minutes = access_token_minutes()
        if minutes:
            access.set_exp(from_time=self.current_time, lifetime=timedelta(minutes=minutes))
        return access
