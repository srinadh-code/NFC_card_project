import re

from django.contrib.auth import authenticate
from django.contrib.auth.password_validation import validate_password
from rest_framework import serializers

from .models import User

#: Registration's phone field is submitted as "+91 " + the 10 digits the
#: user typed (see tracker-main/src/pages/customer/Register.tsx) — so this
#: strips everything but digits, then drops a leading "91" country code
#: (only when that leaves exactly a 10-digit local number) before checking
#: length. A bare 10-digit value with no prefix at all is accepted the same
#: way. Keep in sync with the frontend's isTenDigitPhone() in src/lib/utils.ts.
_PHONE_NON_DIGITS_RE = re.compile(r"\D+")


class UserSerializer(serializers.ModelSerializer):
    avatar = serializers.SerializerMethodField()

    class Meta:
        model = User
        fields = [
            "id",
            "email",
            "full_name",
            "phone",
            "role",
            "avatar",
            "email_verified",
            "created_at",
        ]
        read_only_fields = fields

    def get_avatar(self, obj):
        return obj.avatar_url


class RegisterSerializer(serializers.Serializer):
    full_name = serializers.CharField(max_length=150)
    email = serializers.EmailField()
    phone = serializers.CharField(max_length=20, required=False, allow_blank=True)
    password = serializers.CharField(write_only=True)

    def validate_email(self, value):
        value = value.strip().lower()
        if User.objects.filter(email=value).exists():
            raise serializers.ValidationError("An account with this email already exists.")
        return value

    def validate_phone(self, value):
        value = value.strip()
        if not value:
            return value
        digits = _PHONE_NON_DIGITS_RE.sub("", value)
        if len(digits) == 12 and digits.startswith("91"):
            digits = digits[2:]
        if len(digits) != 10:
            raise serializers.ValidationError("Phone number must be exactly 10 digits.")
        return value

    def validate_password(self, value):
        validate_password(value)
        return value


class VerifyEmailSerializer(serializers.Serializer):
    email = serializers.EmailField()
    otp = serializers.CharField(max_length=6, min_length=6)


class ResendOtpSerializer(serializers.Serializer):
    email = serializers.EmailField()
    purpose = serializers.ChoiceField(choices=["REGISTER", "RESET"], default="REGISTER")


class LoginSerializer(serializers.Serializer):
    email = serializers.EmailField()
    password = serializers.CharField(write_only=True)

    def validate(self, attrs):
        email = attrs["email"].strip().lower()
        user = authenticate(
            request=self.context.get("request"), username=email, password=attrs["password"]
        )
        if user is None:
            raise serializers.ValidationError("Invalid email or password.")
        if not user.is_active:
            raise serializers.ValidationError("This account has been deactivated.")
        attrs["user"] = user
        return attrs


class LogoutSerializer(serializers.Serializer):
    refresh = serializers.CharField()


class ForgotPasswordSerializer(serializers.Serializer):
    email = serializers.EmailField()


class VerifyResetOtpSerializer(serializers.Serializer):
    email = serializers.EmailField()
    otp = serializers.CharField(max_length=6, min_length=6)


class ResetPasswordSerializer(serializers.Serializer):
    # Issued by VerifyResetOtpView after successful OTP verification — the
    # raw OTP itself is never accepted here, only this short-lived,
    # single-purpose authorization (see EmailOTP.issue_reset_token).
    reset_token = serializers.CharField(write_only=True)
    new_password = serializers.CharField(write_only=True)
    confirm_password = serializers.CharField(write_only=True)

    def validate_new_password(self, value):
        validate_password(value)
        return value

    def validate(self, attrs):
        if attrs["new_password"] != attrs["confirm_password"]:
            raise serializers.ValidationError({"confirm_password": "Passwords do not match."})
        return attrs


class ChangePasswordSerializer(serializers.Serializer):
    current_password = serializers.CharField(write_only=True)
    new_password = serializers.CharField(write_only=True)
    confirm_password = serializers.CharField(write_only=True)

    def validate_new_password(self, value):
        validate_password(value)
        return value

    def validate(self, attrs):
        if attrs["new_password"] != attrs["confirm_password"]:
            raise serializers.ValidationError({"confirm_password": "Passwords do not match."})
        return attrs
