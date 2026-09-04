from django.conf import settings
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


def _issue_tokens(user):
    refresh = RefreshToken.for_user(user)
    return {"access": str(refresh.access_token), "refresh": str(refresh)}


def _auth_payload(user):
    return {"user": UserSerializer(user).data, **_issue_tokens(user)}


class RegisterView(APIView):
    permission_classes = [AllowAny]

    def post(self, request):
        serializer = RegisterSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data

        user = User.objects.create_user(
            email=data["email"],
            password=data["password"],
            full_name=data["full_name"],
            phone=data.get("phone", ""),
            is_active=True,
            email_verified=True,
        )

        from profiles.models import Profile

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

        otp.is_used = True
        otp.save(update_fields=["is_used"])

        user.email_verified = True
        user.save(update_fields=["email_verified"])

        from profiles.models import Profile

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
    permission_classes = [AllowAny]

    def post(self, request):
        serializer = LoginSerializer(data=request.data, context={"request": request})
        serializer.is_valid(raise_exception=True)
        user = serializer.validated_data["user"]

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
