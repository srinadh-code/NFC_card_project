import logging
from datetime import timedelta

from django.conf import settings
from django.db import transaction
from django.utils import timezone
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.views import APIView
from rest_framework_simplejwt.tokens import RefreshToken
from rest_framework_simplejwt.exceptions import TokenError
from rest_framework_simplejwt.token_blacklist.models import BlacklistedToken, OutstandingToken

from common.response import error, success
from common.throttling import OtpRequestThrottle

from .emails import send_password_reset_otp_email, send_registration_otp_email
from .models import EmailOTP, User
from .serializers import (
    ChangePasswordSerializer,
    ForgotPasswordSerializer,
    LoginSerializer,
    LogoutSerializer,
    RegisterSerializer,
    ResendOtpSerializer,
    ResetPasswordSerializer,
    UserSerializer,
    VerifyEmailSerializer,
    VerifyResetOtpSerializer,
)

logger = logging.getLogger("accounts.auth")


def _issue_tokens(user):
    refresh = RefreshToken.for_user(user)
    return {"access": str(refresh.access_token), "refresh": str(refresh)}


def _dashboard_url_for(user):
    """
    Convenience field for API consumers that aren't the React frontend
    (which derives this itself from `role` — see auth-store.ts). One
    account model, one `role` field, one login endpoint for both portals
    by design: this is what tells any client where a just-authenticated
    user's dashboard actually is.
    """
    return "/admin/dashboard" if user.role == "ADMIN" else "/dashboard"


def _auth_payload(user):
    return {
        "user": UserSerializer(user).data,
        "dashboard_url": _dashboard_url_for(user),
        **_issue_tokens(user),
    }


def _blacklist_all_tokens_for_user(user):
    """Invalidates every outstanding refresh token for `user` — called after
    a password reset/change so other sessions can't keep refreshing with a
    now-stale credential. Access tokens already issued still work until
    their own short expiry (ACCESS_TOKEN_LIFETIME_MINUTES); only the refresh
    step is blocked, matching how LogoutView already blacklists tokens via
    the same rest_framework_simplejwt.token_blacklist app."""
    for outstanding in OutstandingToken.objects.filter(user=user):
        BlacklistedToken.objects.get_or_create(token=outstanding)


class RegisterView(APIView):
    permission_classes = [AllowAny]

    def post(self, request):
        serializer = RegisterSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data

        from profiles.models import Profile

        with transaction.atomic():
            user = User.objects.create_user(
                email=data["email"],
                password=data["password"],
                full_name=data["full_name"],
                phone=data.get("phone", ""),
                is_active=True,
                email_verified=True,
            )
            Profile.ensure_for_user(user)

        return success(_auth_payload(user), message="Account created.", status=201)


class VerifyEmailView(APIView):
    permission_classes = [AllowAny]

    def post(self, request):
        serializer = VerifyEmailSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        email = serializer.validated_data["email"].strip().lower()
        code = serializer.validated_data["otp"]

        try:
            user = User.objects.get(email=email)
        except User.DoesNotExist:
            return error("Invalid email or verification code.", status=400)

        otp = (
            EmailOTP.objects.filter(
                user=user, purpose=EmailOTP.Purpose.REGISTER, is_used=False
            )
            .order_by("-created_at")
            .first()
        )

        if otp is None or otp.is_expired or not otp.check_code(code):
            return error("Invalid or expired verification code.", status=400)

        from profiles.models import Profile

        with transaction.atomic():
            otp.is_used = True
            otp.save(update_fields=["is_used"])

            user.email_verified = True
            user.save(update_fields=["email_verified"])

            Profile.ensure_for_user(user)

        return success(_auth_payload(user), message="Email verified.")


class ResendOtpView(APIView):
    permission_classes = [AllowAny]
    throttle_classes = [OtpRequestThrottle]

    def post(self, request):
        serializer = ResendOtpSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        email = serializer.validated_data["email"].strip().lower()
        purpose = serializer.validated_data["purpose"]

        RESEND_MESSAGE = "If this account exists, a new code has been sent."

        try:
            user = User.objects.get(email=email)
        except User.DoesNotExist:
            # Do not reveal whether the account exists — including via the
            # presence/absence of `expires_at`. RESET replies always carry a
            # (real or synthetic) timestamp so the shape never differs.
            data = None
            if purpose == EmailOTP.Purpose.RESET:
                data = {"expires_at": timezone.now() + timedelta(minutes=EmailOTP.RESET_OTP_LIFETIME_MINUTES)}
            return success(data, message=RESEND_MESSAGE)

        if purpose == EmailOTP.Purpose.RESET:
            # Same lifetime as ForgotPasswordView — resending must supersede
            # the old code with a fresh 6-minute code, and the countdown the
            # frontend is showing must restart from this new expires_at, not
            # keep counting down against the code that just got invalidated.
            otp, raw_code = EmailOTP.issue(user, purpose, lifetime_minutes=EmailOTP.RESET_OTP_LIFETIME_MINUTES)
            send_password_reset_otp_email(user, raw_code, EmailOTP.RESET_OTP_LIFETIME_MINUTES)
            return success({"expires_at": otp.expires_at}, message=RESEND_MESSAGE)

        _otp, raw_code = EmailOTP.issue(user, purpose)
        send_registration_otp_email(user, raw_code)
        return success(message=RESEND_MESSAGE)


class LoginView(APIView):
    """
    Single login endpoint for both roles — see UserSerializer's `role`
    field. This view never filters by role: any active account with a
    matching email/password authenticates here, admin or customer. Role
    separation (customer-only vs admin-only sign-in) is enforced entirely
    on the frontend (auth-store.ts's performLogin), by design — this
    endpoint is the one thing both /login and /admin/login call.
    """

    permission_classes = [AllowAny]

    def post(self, request):
        email = str(request.data.get("email", "")).strip().lower()
        serializer = LoginSerializer(data=request.data, context={"request": request})
        try:
            serializer.is_valid(raise_exception=True)
        except Exception:
            logger.info("auth.login.failed email=%s", email)
            raise

        user = serializer.validated_data["user"]
        logger.info(
            "auth.login.success user_id=%s role=%s dashboard_url=%s",
            user.id,
            user.role,
            _dashboard_url_for(user),
        )
        return success(_auth_payload(user), message="Login successful.")


class LogoutView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        serializer = LogoutSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        try:
            token = RefreshToken(serializer.validated_data["refresh"])
            token.blacklist()
        except TokenError:
            return error("Invalid or already-expired refresh token.", status=400)

        return success(message="Logged out.")


class ForgotPasswordView(APIView):
    """
    Step 1 of the reset flow. The response is identical whether or not the
    email is registered, and whether or not the Brevo send actually
    succeeds — neither is ever observable from outside, which is what makes
    this safe against account enumeration. The OTP always goes to the
    account's own registered email (the same one used to look it up), never
    an address the request could supply.
    """

    permission_classes = [AllowAny]
    throttle_classes = [OtpRequestThrottle]

    GENERIC_MESSAGE = "If an account exists for this email, an OTP has been sent to the registered email address."

    def post(self, request):
        serializer = ForgotPasswordSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        email = serializer.validated_data["email"].strip().lower()

        try:
            user = User.objects.get(email=email)
        except User.DoesNotExist:
            # Same response shape (message + expires_at) as the real path —
            # a synthetic timestamp here means the frontend's countdown
            # behaves identically either way, and nothing about this branch
            # is observably different from outside.
            expires_at = timezone.now() + timedelta(minutes=EmailOTP.RESET_OTP_LIFETIME_MINUTES)
            return success({"expires_at": expires_at}, message=self.GENERIC_MESSAGE)

        otp, raw_code = EmailOTP.issue(
            user, EmailOTP.Purpose.RESET, lifetime_minutes=EmailOTP.RESET_OTP_LIFETIME_MINUTES
        )
        send_password_reset_otp_email(user, raw_code, EmailOTP.RESET_OTP_LIFETIME_MINUTES)

        return success({"expires_at": otp.expires_at}, message=self.GENERIC_MESSAGE)


class VerifyResetOtpView(APIView):
    """
    Step 2 — verifies the emailed OTP and, only on success, grants the
    short-lived reset authorization ResetPasswordView requires. The raw OTP
    is never accepted again after this point; frontend state claiming
    "otp verified" carries no weight without the token this returns.

    Deliberately NOT throttled by OtpRequestThrottle: that scope is shared
    (per-email, "otp": "5/min") with ForgotPasswordView/ResendOtpView, so
    reusing it here would let a few wrong guesses burn through the same
    budget a legitimate user needs to request a fresh code. Brute-force
    protection on verification is handled precisely by EmailOTP's own
    per-row `attempts` ceiling (MAX_ATTEMPTS) instead — see check_code().
    """

    permission_classes = [AllowAny]

    GENERIC_ERROR = "Invalid or expired code."

    def post(self, request):
        serializer = VerifyResetOtpSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data
        email = data["email"].strip().lower()

        try:
            user = User.objects.get(email=email)
        except User.DoesNotExist:
            return error(self.GENERIC_ERROR, status=400)

        # Not filtered to is_used=False: once check_code() locks an OTP out
        # at MAX_ATTEMPTS it sets is_used=True, and a filtered query would
        # then find nothing on the next attempt — collapsing the specific
        # "too many attempts" outcome into the generic one below. Look up
        # the latest RESET row regardless of is_used, then classify why.
        otp = (
            EmailOTP.objects.filter(user=user, purpose=EmailOTP.Purpose.RESET)
            .order_by("-created_at")
            .first()
        )

        if otp is None or otp.is_expired:
            return error(self.GENERIC_ERROR, status=400)

        if otp.attempts >= EmailOTP.MAX_ATTEMPTS:
            return error("Too many incorrect attempts. Please request a new code.", status=400)

        if otp.is_used:  # superseded by a resend, or already verified once
            return error(self.GENERIC_ERROR, status=400)

        if not otp.check_code(data["otp"]):
            if otp.attempts >= EmailOTP.MAX_ATTEMPTS:
                return error("Too many incorrect attempts. Please request a new code.", status=400)
            return error(self.GENERIC_ERROR, status=400)

        reset_token = otp.issue_reset_token()
        return success({"reset_token": reset_token}, message="Code verified.")


class ResetPasswordView(APIView):
    """
    Step 3 — requires the reset authorization from VerifyResetOtpView, not
    the raw OTP. A missing/expired/already-used token is rejected exactly
    like an invalid one; there is no path that sets the password without it.
    """

    permission_classes = [AllowAny]

    def post(self, request):
        serializer = ResetPasswordSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data

        otp = EmailOTP.get_by_reset_token(data["reset_token"])
        if otp is None:
            return error("Invalid or expired reset authorization. Please verify your code again.", status=400)

        with transaction.atomic():
            otp.consume_reset_token()
            otp.user.set_password(data["new_password"])
            otp.user.save(update_fields=["password"])

        _blacklist_all_tokens_for_user(otp.user)

        return success(message="Password reset. You can now log in.")


class ChangePasswordView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        serializer = ChangePasswordSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data
        user = request.user

        if not user.check_password(data["current_password"]):
            return error("Current password is incorrect.", status=400)

        user.set_password(data["new_password"])
        user.save(update_fields=["password"])
        _blacklist_all_tokens_for_user(user)

        return success(message="Password changed.")


class GoogleLoginView(APIView):
    """
    Integration point for Google OAuth2 login.

    Not implemented in this pass — no OAuth credentials are configured.
    Once GOOGLE_OAUTH_CLIENT_ID / GOOGLE_OAUTH_CLIENT_SECRET are set in the
    environment, this view should: verify the id_token/auth code Google
    returns to the frontend, get-or-create a User from the verified email,
    mark email_verified=True, and return the same {user, access, refresh}
    payload as LoginView.
    """

    permission_classes = [AllowAny]

    def post(self, request):
        if not settings.GOOGLE_OAUTH_CLIENT_ID:
            return error(
                "Google sign-in is not configured on this server yet.",
                errors={"code": "google_oauth_not_configured"},
                status=501,
            )
        return error("Google sign-in is not implemented yet.", status=501)


class MeView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        return success(UserSerializer(request.user).data)
