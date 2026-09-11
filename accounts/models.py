import secrets
from datetime import timedelta

from django.contrib.auth.base_user import AbstractBaseUser, BaseUserManager
from django.contrib.auth.hashers import check_password, make_password
from django.contrib.auth.models import PermissionsMixin
from django.db import models, transaction
from django.utils import timezone


class UserManager(BaseUserManager):
    use_in_migrations = True

    def _create_user(self, email, password, **extra_fields):
        if not email:
            raise ValueError("Users must have an email address")
        email = self.normalize_email(email)
        user = self.model(email=email, **extra_fields)
        user.set_password(password)
        user.save(using=self._db)
        return user

    def create_user(self, email, password=None, **extra_fields):
        extra_fields.setdefault("is_staff", False)
        extra_fields.setdefault("is_superuser", False)
        extra_fields.setdefault("role", User.Role.CUSTOMER)
        return self._create_user(email, password, **extra_fields)

    def create_superuser(self, email, password=None, **extra_fields):
        extra_fields.setdefault("is_staff", True)
        extra_fields.setdefault("is_superuser", True)
        extra_fields.setdefault("is_active", True)
        extra_fields.setdefault("email_verified", True)
        extra_fields.setdefault("role", User.Role.ADMIN)

        if extra_fields.get("is_staff") is not True:
            raise ValueError("Superuser must have is_staff=True.")
        if extra_fields.get("is_superuser") is not True:
            raise ValueError("Superuser must have is_superuser=True.")

        return self._create_user(email, password, **extra_fields)


class User(AbstractBaseUser, PermissionsMixin):
    class Role(models.TextChoices):
        ADMIN = "ADMIN", "Admin"
        CUSTOMER = "CUSTOMER", "Customer"

    email = models.EmailField(unique=True, db_index=True)
    full_name = models.CharField(max_length=150, blank=True)
    phone = models.CharField(max_length=20, blank=True)
    role = models.CharField(max_length=10, choices=Role.choices, default=Role.CUSTOMER)
    avatar = models.ImageField(upload_to="avatars/", null=True, blank=True)

    is_active = models.BooleanField(default=True)
    is_staff = models.BooleanField(default=False)
    email_verified = models.BooleanField(default=False)

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    objects = UserManager()

    USERNAME_FIELD = "email"
    REQUIRED_FIELDS = []

    class Meta:
        ordering = ["-created_at"]

    def __str__(self):
        return self.email

    @property
    def avatar_url(self):
        if self.avatar:
            return self.avatar.url
        seed = self.full_name or self.email
        return f"https://api.dicebear.com/7.x/initials/svg?seed={seed}"


class EmailOTP(models.Model):
    """One-time code for email verification and password reset. Both
    purposes are delivered by email (REGISTER via Django's EMAIL_BACKEND,
    RESET via Brevo's HTTP API — see accounts/emails.py) — there is no
    per-channel branching to track, unlike an earlier SMS-based revision of
    this model."""

    class Purpose(models.TextChoices):
        REGISTER = "REGISTER", "Register"
        RESET = "RESET", "Password Reset"

    # Wrong-guess ceiling for `check_code()` — once reached the OTP is
    # locked out (is_used=True) and a fresh one must be requested. This is
    # the anti-brute-force control; the per-email OtpRequestThrottle
    # (common/throttling.py) only limits how often new OTPs can be
    # requested, not how many times an issued one can be guessed.
    MAX_ATTEMPTS = 5

    # Single source of truth for how long a RESET-purpose OTP stays valid —
    # both accounts/views.py (enforcement + the `expires_at` it returns) and
    # accounts/emails.py (the "expires in N minutes" wording in the email
    # itself) read this constant rather than hardcoding the number twice.
    # REGISTER-purpose OTPs are unaffected (EmailOTP.issue()'s own
    # lifetime_minutes=10 default still applies there).
    RESET_OTP_LIFETIME_MINUTES = 6

    # How long a granted password-reset authorization (see
    # `issue_reset_token`) stays usable after successful OTP verification —
    # deliberately short-lived and single-purpose, independent of the OTP's
    # own (shorter) expiry.
    RESET_TOKEN_LIFETIME_MINUTES = 10

    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name="otps")
    # Hashed with the same hasher as user passwords (django.contrib.auth.hashers)
    # rather than stored in plaintext — see generate_code()/issue()/check_code().
    code_hash = models.CharField(max_length=128)
    purpose = models.CharField(max_length=10, choices=Purpose.choices)
    attempts = models.PositiveSmallIntegerField(default=0)
    created_at = models.DateTimeField(auto_now_add=True)
    expires_at = models.DateTimeField()
    is_used = models.BooleanField(default=False)

    # Set only once this OTP has been successfully verified for a RESET —
    # a hashed, single-use, short-lived authorization that ResetPasswordView
    # requires instead of re-accepting the raw OTP a second time. Blank/null
    # until verification grants it; cleared again the moment it's consumed
    # (see consume_reset_token()) so it can never be replayed.
    reset_token_hash = models.CharField(max_length=128, blank=True, default="")
    reset_token_expires_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        indexes = [models.Index(fields=["user", "purpose", "is_used"])]

    def __str__(self):
        return f"{self.user.email} [{self.purpose}]"

    @staticmethod
    def generate_code():
        return f"{secrets.randbelow(1_000_000):06d}"

    @classmethod
    def issue(cls, user, purpose, lifetime_minutes=10):
        """Supersedes any still-unused OTP of the same purpose, then issues a
        fresh one. Returns (otp, raw_code) — the raw code is never persisted,
        only its hash, so callers must send/return it to the user immediately
        (it cannot be read back from the returned `otp` afterwards)."""
        with transaction.atomic():
            cls.objects.filter(user=user, purpose=purpose, is_used=False).update(is_used=True)
            raw_code = cls.generate_code()
            otp = cls.objects.create(
                user=user,
                code_hash=make_password(raw_code),
                purpose=purpose,
                expires_at=timezone.now() + timedelta(minutes=lifetime_minutes),
            )
            return otp, raw_code

    @property
    def is_expired(self):
        return timezone.now() >= self.expires_at

    def is_valid(self):
        return not self.is_used and not self.is_expired and self.attempts < self.MAX_ATTEMPTS

    def check_code(self, raw_code):
        """Verifies `raw_code` against the stored hash, tracking the attempt
        regardless of outcome. Locks the OTP out (is_used=True) once
        MAX_ATTEMPTS is reached, so a wrong guess can never be retried
        indefinitely. Callers must check `is_valid()`/expiry BEFORE calling
        this — it does not re-check expiry itself, only the attempt ceiling."""
        if self.attempts >= self.MAX_ATTEMPTS:
            return False

        self.attempts += 1
        matched = check_password(raw_code, self.code_hash)
        update_fields = ["attempts"]
        if not matched and self.attempts >= self.MAX_ATTEMPTS:
            self.is_used = True
            update_fields.append("is_used")
        self.save(update_fields=update_fields)
        return matched

    def issue_reset_token(self):
        """Called once, immediately after a successful RESET-purpose
        check_code(). Grants a short-lived, single-purpose authorization for
        ResetPasswordView, consumes this OTP (is_used=True) so it can't be
        re-verified, and returns the raw token — only its hash is stored."""
        raw_secret = secrets.token_urlsafe(32)
        self.reset_token_hash = make_password(raw_secret)
        self.reset_token_expires_at = timezone.now() + timedelta(minutes=self.RESET_TOKEN_LIFETIME_MINUTES)
        self.is_used = True
        self.save(update_fields=["reset_token_hash", "reset_token_expires_at", "is_used"])
        return f"{self.pk}.{raw_secret}"

    @classmethod
    def get_by_reset_token(cls, raw_token):
        """Resolves a token from issue_reset_token() back to its OTP row, or
        None if it's malformed, unknown, expired, or already consumed."""
        try:
            pk_str, raw_secret = raw_token.split(".", 1)
            pk = int(pk_str)
        except (ValueError, AttributeError):
            return None

        try:
            otp = cls.objects.get(pk=pk, purpose=cls.Purpose.RESET)
        except cls.DoesNotExist:
            return None

        if (
            not otp.reset_token_hash
            or otp.reset_token_expires_at is None
            or timezone.now() >= otp.reset_token_expires_at
            or not check_password(raw_secret, otp.reset_token_hash)
        ):
            return None
        return otp

    def consume_reset_token(self):
        """Invalidates the reset authorization immediately after a successful
        password reset, so the same token can never be replayed."""
        self.reset_token_hash = ""
        self.reset_token_expires_at = None
        self.save(update_fields=["reset_token_hash", "reset_token_expires_at"])
