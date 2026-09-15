import logging
from datetime import timedelta

from django.conf import settings
from django.db import transaction
from django.utils import timezone
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.views import APIView
from rest_framework_simplejwt.tokens import RefreshToken
from rest_framework_simplejwt.exceptions import TokenError

from common.response import error, success
from common.throttling import OtpRequestThrottle

from .emails import send_otp_email
from .google_oauth import GoogleTokenError, verify_google_id_token
from .models import EmailOTP, User
from .security import access_token_minutes
from .serializers import (
    ChangePasswordSerializer,
    ForgotPasswordSerializer,
    GoogleLoginSerializer,
    LoginSerializer,
    LogoutSerializer,
    RegisterSerializer,
    ResendOtpSerializer,
    ResetPasswordSerializer,
    UserSerializer,
    VerifyEmailSerializer,
)

logger = logging.getLogger("accounts.auth")


def _issue_tokens(user):
    refresh = RefreshToken.for_user(user)
    # Admin-configured session timeout (Settings > Security) overrides the
    # server's env-configured default at the moment each token is minted —
    # real enforcement, not a stored-but-ignored preference.
    minutes = access_token_minutes()
    if minutes:
        refresh.access_token.set_exp(lifetime=timedelta(minutes=minutes))
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

        if otp is None or otp.code != code or not otp.is_valid():
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

        try:
            user = User.objects.get(email=email)
        except User.DoesNotExist:
            # Do not reveal whether the account exists.
            return success(message="If this account exists, a new code has been sent.")

        otp = EmailOTP.issue(user, purpose)
        send_otp_email(user, otp, purpose)

        return success(message="If this account exists, a new code has been sent.")


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
    permission_classes = [AllowAny]
    throttle_classes = [OtpRequestThrottle]

    def post(self, request):
        serializer = ForgotPasswordSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        email = serializer.validated_data["email"].strip().lower()

        try:
            user = User.objects.get(email=email)
        except User.DoesNotExist:
            return success(message="If this account exists, a reset code has been sent.")

        otp = EmailOTP.issue(user, EmailOTP.Purpose.RESET)
        send_otp_email(user, otp, "RESET")

        return success(message="If this account exists, a reset code has been sent.")


class ResetPasswordView(APIView):
    permission_classes = [AllowAny]

    def post(self, request):
        serializer = ResetPasswordSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data
        email = data["email"].strip().lower()

        try:
            user = User.objects.get(email=email)
        except User.DoesNotExist:
            return error("Invalid or expired reset code.", status=400)

        otp = (
            EmailOTP.objects.filter(user=user, purpose=EmailOTP.Purpose.RESET, is_used=False)
            .order_by("-created_at")
            .first()
        )

        if otp is None or otp.code != data["otp"] or not otp.is_valid():
            return error("Invalid or expired reset code.", status=400)

        with transaction.atomic():
            otp.is_used = True
            otp.save(update_fields=["is_used"])

            user.set_password(data["new_password"])
            user.save(update_fields=["password"])

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

        return success(message="Password changed.")


class GoogleLoginView(APIView):
    """
    Google Sign-In. The frontend's Google Identity Services button
    authenticates the user directly with Google (no redirect through this
    server) and hands back a signed ID token ("credential"); this view
    verifies that token for real (accounts/google_oauth.py — signature,
    audience, issuer, expiry) and then get-or-creates a User from its
    verified claims, returning the same {user, access, refresh} payload as
    LoginView/RegisterView so the frontend's existing session handling
    (setTokens + setUser) needs no special-casing for this login path.

    Matching/linking logic (see below): match by `google_id` first (an
    account that has already signed in with Google before), then by
    `email` (an existing email/password account using Google for the first
    time gets linked, not duplicated), and only create a new User if
    neither matches — this is what "prevent duplicate accounts" means here.
    """

    permission_classes = [AllowAny]

    def post(self, request):
        if not settings.GOOGLE_OAUTH_CLIENT_ID:
            return error(
                "Google sign-in is not configured on this server yet.",
                errors={"code": "google_oauth_not_configured"},
                status=501,
            )

        serializer = GoogleLoginSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        try:
            claims = verify_google_id_token(serializer.validated_data["credential"])
        except GoogleTokenError as exc:
            logger.info("auth.google.failed reason=%s", exc)
            return error("Invalid or expired Google credential. Please try again.", status=400)

        google_id = claims["sub"]
        email = claims["email"].strip().lower()
        full_name = claims.get("name", "").strip()
        picture = claims.get("picture", "")

        from profiles.models import Profile

        with transaction.atomic():
            user = User.objects.filter(google_id=google_id).first()
            if user is None:
                user = User.objects.filter(email=email).first()

            created = user is None
            if created:
                # password=None -> Django's make_password(None) stores an
                # unusable hash, same as User.set_unusable_password() would
                # — this account can only ever sign in via Google unless the
                # customer later sets a real password through a "forgot
                # password" reset.
                user = User.objects.create_user(
                    email=email,
                    password=None,
                    full_name=full_name,
                    is_active=True,
                    email_verified=True,
                )

            update_fields = []
            if user.google_id != google_id:
                user.google_id = google_id
                update_fields.append("google_id")
            if not user.email_verified:
                user.email_verified = True
                update_fields.append("email_verified")
            if picture and user.google_avatar_url != picture:
                user.google_avatar_url = picture
                update_fields.append("google_avatar_url")
            if not user.full_name and full_name:
                user.full_name = full_name
                update_fields.append("full_name")
            if update_fields:
                user.save(update_fields=update_fields)

            Profile.ensure_for_user(user)

        logger.info(
            "auth.google.success user_id=%s created=%s role=%s",
            user.id,
            created,
            user.role,
        )
        return success(
            _auth_payload(user),
            message="Signed in with Google.",
            status=201 if created else 200,
        )


class MeView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        return success(UserSerializer(request.user).data)
