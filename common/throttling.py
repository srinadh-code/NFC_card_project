from rest_framework.throttling import SimpleRateThrottle


class OtpRequestThrottle(SimpleRateThrottle):
    """Throttles OTP request/resend endpoints per-email to prevent abuse."""

    scope = "otp"

    def get_cache_key(self, request, view):
        email = (request.data.get("email") or "").strip().lower()
        if not email:
            return None
        return self.cache_format % {"scope": self.scope, "ident": email}


class AuthEmailHourlyThrottle(OtpRequestThrottle):
    """Hourly per-email cap on endpoints that send auth emails (verification,
    password reset) — on top of OtpRequestThrottle's per-minute limit, so one
    inbox can't be flooded by spreading requests out."""

    scope = "auth_email_hourly"


class AuthEmailIPThrottle(SimpleRateThrottle):
    """Per-client-IP cap on the same endpoints, so one client can't send to
    many different addresses."""

    scope = "auth_email_ip"

    def get_cache_key(self, request, view):
        return self.cache_format % {"scope": self.scope, "ident": self.get_ident(request)}
