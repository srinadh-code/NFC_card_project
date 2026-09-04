from rest_framework.throttling import SimpleRateThrottle


class OtpRequestThrottle(SimpleRateThrottle):
    """Throttles OTP request/resend endpoints per-email to prevent abuse."""

    scope = "otp"

    def get_cache_key(self, request, view):
        email = (request.data.get("email") or "").strip().lower()
        if not email:
            return None
        return self.cache_format % {"scope": self.scope, "ident": email}
