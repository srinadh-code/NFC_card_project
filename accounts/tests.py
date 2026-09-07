from unittest.mock import patch

from django.urls import reverse
from rest_framework import status
from rest_framework.test import APITestCase
from rest_framework_simplejwt.tokens import RefreshToken

from common.test_utils import make_user
from profiles.models import Profile

from .models import EmailOTP, User


class RegisterViewTests(APITestCase):
    def _payload(self, **overrides):
        payload = {
            "full_name": "New Customer",
            "email": "newcustomer@example.com",
            "phone": "+919876543210",
            "password": "StrongPass123",
        }
        payload.update(overrides)
        return payload

    def test_register_creates_user_and_profile(self):
        response = self.client.post(reverse("auth-register"), self._payload(), format="json")

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertTrue(response.data["success"])
        self.assertIn("access", response.data["data"])
        self.assertIn("refresh", response.data["data"])

        user = User.objects.get(email="newcustomer@example.com")
        self.assertTrue(user.is_active)
        self.assertTrue(Profile.objects.filter(user=user).exists())

    def test_duplicate_email_is_rejected(self):
        self.client.post(reverse("auth-register"), self._payload(), format="json")

        response = self.client.post(reverse("auth-register"), self._payload(), format="json")

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertFalse(response.data["success"])
        self.assertEqual(User.objects.filter(email="newcustomer@example.com").count(), 1)

    def test_registration_rolls_back_user_if_profile_creation_fails(self):
        """
        Regression test for the exact reported bug: a DB error while creating
        the Profile must not leave a User row behind — otherwise the next
        signup attempt with the same email permanently 400s with "already
        exists" while the account itself is unusable.
        """
        with patch("profiles.models.Profile.ensure_for_user", side_effect=RuntimeError("boom")):
            with self.assertRaises(RuntimeError):
                self.client.post(reverse("auth-register"), self._payload(), format="json")

        self.assertFalse(User.objects.filter(email="newcustomer@example.com").exists())

    def test_weak_password_is_rejected(self):
        response = self.client.post(reverse("auth-register"), self._payload(password="123"), format="json")
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertFalse(User.objects.filter(email="newcustomer@example.com").exists())


class LoginViewTests(APITestCase):
    def setUp(self):
        self.user = make_user(email="login@example.com", password="StrongPass123")

    def test_login_returns_tokens(self):
        response = self.client.post(
            reverse("auth-login"), {"email": "login@example.com", "password": "StrongPass123"}, format="json"
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertIn("access", response.data["data"])
        self.assertIn("refresh", response.data["data"])

    def test_wrong_password_rejected(self):
        response = self.client.post(
            reverse("auth-login"), {"email": "login@example.com", "password": "wrong"}, format="json"
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_inactive_account_rejected(self):
        self.user.is_active = False
        self.user.save(update_fields=["is_active"])
        response = self.client.post(
            reverse("auth-login"), {"email": "login@example.com", "password": "StrongPass123"}, format="json"
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)


class LogoutViewTests(APITestCase):
    def test_logout_blacklists_refresh_token(self):
        user = make_user(email="logout@example.com")
        refresh = RefreshToken.for_user(user)
        self.client.force_authenticate(user=user)

        response = self.client.post(reverse("auth-logout"), {"refresh": str(refresh)}, format="json")
        self.assertEqual(response.status_code, status.HTTP_200_OK)

        response = self.client.post(reverse("auth-token-refresh"), {"refresh": str(refresh)}, format="json")
        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_logout_requires_authentication(self):
        response = self.client.post(reverse("auth-logout"), {"refresh": "whatever"}, format="json")
        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)


class ForgotAndResetPasswordTests(APITestCase):
    def setUp(self):
        self.user = make_user(email="forgot@example.com", password="OldPass123")

    def test_forgot_password_issues_otp_without_revealing_existence(self):
        response = self.client.post(reverse("auth-forgot-password"), {"email": "forgot@example.com"}, format="json")
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertTrue(EmailOTP.objects.filter(user=self.user, purpose=EmailOTP.Purpose.RESET).exists())

        unknown_response = self.client.post(
            reverse("auth-forgot-password"), {"email": "unknown@example.com"}, format="json"
        )
        self.assertEqual(unknown_response.status_code, status.HTTP_200_OK)
        self.assertEqual(unknown_response.data["message"], response.data["message"])

    def test_reset_password_with_valid_otp(self):
        otp = EmailOTP.issue(self.user, EmailOTP.Purpose.RESET)

        response = self.client.post(
            reverse("auth-reset-password"),
            {"email": "forgot@example.com", "otp": otp.code, "new_password": "NewPass456"},
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.user.refresh_from_db()
        self.assertTrue(self.user.check_password("NewPass456"))

        otp.refresh_from_db()
        self.assertTrue(otp.is_used)

    def test_reset_password_rejects_reused_otp(self):
        otp = EmailOTP.issue(self.user, EmailOTP.Purpose.RESET)
        payload = {"email": "forgot@example.com", "otp": otp.code, "new_password": "NewPass456"}
        self.client.post(reverse("auth-reset-password"), payload, format="json")

        response = self.client.post(reverse("auth-reset-password"), payload, format="json")
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_reset_password_rejects_wrong_otp(self):
        EmailOTP.issue(self.user, EmailOTP.Purpose.RESET)
        response = self.client.post(
            reverse("auth-reset-password"),
            {"email": "forgot@example.com", "otp": "000000", "new_password": "NewPass456"},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)


class VerifyEmailViewTests(APITestCase):
    def test_verify_email_with_valid_otp_activates_and_creates_profile(self):
        user = make_user(email="verify@example.com", email_verified=False)
        otp = EmailOTP.issue(user, EmailOTP.Purpose.REGISTER)

        response = self.client.post(
            reverse("auth-verify-email"), {"email": "verify@example.com", "otp": otp.code}, format="json"
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        user.refresh_from_db()
        self.assertTrue(user.email_verified)
        self.assertTrue(Profile.objects.filter(user=user).exists())

    def test_verify_email_rejects_invalid_code(self):
        user = make_user(email="verify2@example.com", email_verified=False)
        EmailOTP.issue(user, EmailOTP.Purpose.REGISTER)

        response = self.client.post(
            reverse("auth-verify-email"), {"email": "verify2@example.com", "otp": "000000"}, format="json"
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)


class TokenRefreshTests(APITestCase):
    def test_refresh_returns_new_access_token(self):
        user = make_user(email="refresh@example.com")
        refresh = RefreshToken.for_user(user)

        response = self.client.post(reverse("auth-token-refresh"), {"refresh": str(refresh)}, format="json")

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertIn("access", response.data)


class MeViewTests(APITestCase):
    def test_me_requires_authentication(self):
        response = self.client.get(reverse("auth-me"))
        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_me_returns_current_user(self):
        user = make_user(email="me@example.com")
        self.client.force_authenticate(user=user)
        response = self.client.get(reverse("auth-me"))
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["data"]["email"], "me@example.com")
