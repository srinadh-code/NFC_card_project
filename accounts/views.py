import logging

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
