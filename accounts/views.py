import logging
import threading
from datetime import timedelta

from django.conf import settings
from django.contrib.auth.hashers import make_password
from django.db import connection, transaction
from django.utils import timezone
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.views import APIView
from rest_framework_simplejwt.tokens import RefreshToken
from rest_framework_simplejwt.exceptions import TokenError
from rest_framework_simplejwt.token_blacklist.models import BlacklistedToken, OutstandingToken

from common.response import error, success
from common.throttling import AuthEmailHourlyThrottle, AuthEmailIPThrottle, OtpRequestThrottle

from .emails import send_password_reset_otp_email, send_verification_email
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
    VerifyResetOtpSerializer,
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


# Every endpoint that can trigger an auth email: per-minute and per-hour
# limits per email address, plus a per-client-IP limit.
AUTH_EMAIL_THROTTLES = [OtpRequestThrottle, AuthEmailHourlyThrottle, AuthEmailIPThrottle]


def _send_in_background(send_fn, *args):
    """Runs an email send after the response has gone out, for endpoints
    whose reply must not reveal whether an account exists — otherwise the
    extra time spent calling Brevo for a real account would give it away.
    The send functions never raise and never touch the database."""

    def run():
        try:
            send_fn(*args)
        finally:
            connection.close()

    threading.Thread(target=run, daemon=True).start()


def _equalize_hashing_time():
    """Burns the same password-hasher time a real token issue would, so an
    unknown email can't be told apart from a known one by response time."""
    make_password("timing-equalizer")


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
                email_verified=False,
            )
            Profile.ensure_for_user(user)

        # No session until the email is verified (LoginView enforces the
        # same rule). The account already exists, so reporting delivery
        # failure here reveals nothing — and the customer needs to know to
        # use "Resend verification email".
        email_sent = send_verification_email(user, EmailOTP.issue_verification_link(user))
        message = (
            "Account created. Check your email for a link to verify your address."
            if email_sent
            else "Account created, but we couldn't send the verification email. Please use Resend verification email."
        )
        return success({"email": user.email, "verification_email_sent": email_sent}, message=message, status=201)
    
    


class VerifyEmailView(APIView):
    """Confirms the emailed verification link. Single-use: once the account
    is verified the same link reports "already verified", and a link
    superseded by a newer one (or past its 24h lifetime) is rejected."""

    permission_classes = [AllowAny]

    def post(self, request):
        serializer = VerifyEmailSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        outcome, otp = EmailOTP.check_verification_link(serializer.validated_data["token"])

        if outcome == EmailOTP.LINK_ALREADY_VERIFIED:
            return success(
                {"email": otp.user.email, "already_verified": True},
                message="Your email is already verified. You can log in.",
            )
        if outcome == EmailOTP.LINK_EXPIRED:
            return error(
                "This verification link has expired. Request a new one below.",
                errors={"code": "token_expired"},
                status=400,
            )
        if outcome != EmailOTP.LINK_VALID:
            return error(
                "This verification link is invalid or has been replaced by a newer one. Request a new one below.",
                errors={"code": "token_invalid"},
                status=400,
            )

        from profiles.models import Profile

        user = otp.user
        with transaction.atomic():
            otp.is_used = True
            otp.save(update_fields=["is_used"])
            user.email_verified = True
            user.save(update_fields=["email_verified"])
            Profile.ensure_for_user(user)

        logger.info("auth.verify_email.success user_id=%s", user.id)
        return success(
            {"email": user.email, "already_verified": False},
            message="Email verified. You can now log in.",
        )


class ResendOtpView(APIView):
    """Resends the verification link (purpose REGISTER) or a fresh password-
    reset code (purpose RESET, superseding the previous one). The reply is
    identical whether or not the account exists or still needs the email,
    and the send happens after the response so timing can't reveal it
    either."""

    permission_classes = [AllowAny]
    throttle_classes = AUTH_EMAIL_THROTTLES

    RESEND_MESSAGE = "If this email needs it, a new link has been sent. Please check your inbox."
    RESEND_CODE_MESSAGE = "If an account exists for this email, a new code has been sent."

    def post(self, request):
        serializer = ResendOtpSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        email = serializer.validated_data["email"].strip().lower()
        purpose = serializer.validated_data["purpose"]

        user = User.objects.filter(email=email, is_active=True).first()

        if purpose == EmailOTP.Purpose.RESET:
            return success({"expires_at": _issue_and_send_reset_otp(user)}, message=self.RESEND_CODE_MESSAGE)

        if user is not None and not user.email_verified:
            _send_in_background(send_verification_email, user, EmailOTP.issue_verification_link(user))
        else:
            _equalize_hashing_time()
        return success(message=self.RESEND_MESSAGE)


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
        # Checked only after the password matched, so this never reveals an
        # account's verification status to someone without its password.
        # Admins are never blocked (they're created verified).
        if user.role == User.Role.CUSTOMER and not user.email_verified:
            logger.info("auth.login.unverified user_id=%s", user.id)
            return error(
                "Please verify your email address before logging in. Check your inbox for the verification link.",
                errors={"code": "email_not_verified", "email": user.email},
                status=403,
            )

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


def _issue_and_send_reset_otp(user):
    """Issues a fresh 5-minute reset code for `user` (superseding any older
    one) and emails it after the response; for an unknown email (`user` is
    None) does matching hashing work instead. Returns the code's expiry —
    a synthetic one for unknown emails, so the reply looks the same."""
    lifetime = EmailOTP.RESET_OTP_LIFETIME_MINUTES
    if user is None:
        _equalize_hashing_time()
        return timezone.now() + timedelta(minutes=lifetime)
    otp, raw_code = EmailOTP.issue(user, EmailOTP.Purpose.RESET, lifetime_minutes=lifetime)
    _send_in_background(send_password_reset_otp_email, user, raw_code, lifetime)
    return otp.expires_at


class ForgotPasswordView(APIView):
    """
    Step 1 of the reset flow: emails a 6-digit code to the account's own
    registered address. The response is identical whether or not the email
    is registered and whether or not Brevo accepts the send — and the send
    happens after the response, with matching hashing work for unknown
    emails, so neither content nor timing reveals whether an account exists.
    """

    permission_classes = [AllowAny]
    throttle_classes = AUTH_EMAIL_THROTTLES

    GENERIC_MESSAGE = "If an account exists for this email, an OTP has been sent to the registered email address."

    def post(self, request):
        serializer = ForgotPasswordSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        email = serializer.validated_data["email"].strip().lower()

        user = User.objects.filter(email=email, is_active=True).first()
        return success({"expires_at": _issue_and_send_reset_otp(user)}, message=self.GENERIC_MESSAGE)


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
            # Same hashing time as a real code check, so response time
            # doesn't reveal whether the account exists.
            _equalize_hashing_time()
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
            _equalize_hashing_time()
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
            return error(
                "Your reset session has expired or was already used. Please request a new code.",
                errors={"code": "token_invalid"},
                status=400,
            )

        with transaction.atomic():
            otp.consume_reset_token()
            otp.user.set_password(data["new_password"])
            # Entering a code sent to this inbox proves the customer controls
            # it — the same thing email verification checks.
            otp.user.email_verified = True
            otp.user.save(update_fields=["password", "email_verified"])

        _blacklist_all_tokens_for_user(otp.user)
        logger.info("auth.reset_password.success user_id=%s", otp.user.id)

        return success(message="Your password has been reset. You can now log in with your new password.")


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
    
    
    
    




