from datetime import timedelta
from unittest.mock import ANY, patch

import requests
from django.urls import reverse
from django.utils import timezone
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
            "password": "Strong@123",
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


class PhoneValidationTests(APITestCase):
    """
    RegisterSerializer.validate_phone is the backstop for the signup form's
    digit-only, 10-digit phone field — whatever the frontend blocks via its
    onChange filter/maxLength must also be rejected here, since that
    filtering can be bypassed entirely (a direct API call, a modified
    request). See tracker-main/src/pages/customer/Register.tsx and
    src/lib/utils.ts's isTenDigitPhone() for the frontend half of this.
    """

    def _payload(self, **overrides):
        payload = {
            "full_name": "Phone Probe",
            "email": "phoneprobe@example.com",
            "phone": "+919876543210",
            "password": "Strong@123",
        }
        payload.update(overrides)
        return payload

    def test_ten_digit_phone_with_country_code_prefix_is_accepted(self):
        # Exactly what the frontend submits: "+91" + the 10 digits typed.
        response = self.client.post(reverse("auth-register"), self._payload(phone="+919876543210"), format="json")
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)

    def test_bare_ten_digit_phone_is_accepted(self):
        response = self.client.post(reverse("auth-register"), self._payload(phone="9876543210"), format="json")
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)

    def test_nine_digit_phone_is_rejected(self):
        response = self.client.post(reverse("auth-register"), self._payload(phone="987654321"), format="json")
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("10 digits", str(response.data["errors"]))
        self.assertFalse(User.objects.filter(email="phoneprobe@example.com").exists())

    def test_eleven_digit_phone_is_rejected(self):
        response = self.client.post(reverse("auth-register"), self._payload(phone="98765432101"), format="json")
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("10 digits", str(response.data["errors"]))

    def test_non_numeric_phone_is_rejected(self):
        response = self.client.post(reverse("auth-register"), self._payload(phone="98ABCD4321"), format="json")
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("10 digits", str(response.data["errors"]))

    def test_blank_phone_is_still_accepted(self):
        # phone remains optional at the API level (allow_blank=True) — this
        # test only pins the format check, not whether phone is mandatory.
        response = self.client.post(reverse("auth-register"), self._payload(phone=""), format="json")
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)


class PasswordPolicyTests(APITestCase):
    """
    The registration endpoint is the backstop for the signup form's live
    checklist: whatever the checklist shows as unmet must also be refused
    here, because the frontend can be bypassed entirely.

    The rules themselves live in accounts/validators.py +
    AUTH_PASSWORD_VALIDATORS; these cases pin the observable behaviour.
    """

    def _register(self, password):
        return self.client.post(
            reverse("auth-register"),
            {
                "full_name": "Policy Probe",
                "email": "policy@example.com",
                "phone": "+919876543210",
                "password": password,
            },
            format="json",
        )

    def assertRejected(self, password, expected_fragment):
        response = self._register(password)
        self.assertEqual(
            response.status_code,
            status.HTTP_400_BAD_REQUEST,
            msg=f"{password!r} should have been rejected",
        )
        self.assertIn(expected_fragment, str(response.data["errors"]).lower())
        self.assertFalse(User.objects.filter(email="policy@example.com").exists())

    def test_empty_password_is_rejected(self):
        response = self._register("")
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertFalse(User.objects.filter(email="policy@example.com").exists())

    def test_too_short_is_rejected(self):
        # "Kavya@1" — 7 characters, one below the 8-character minimum.
        self.assertRejected("Kavya@1", "too short")

    def test_too_long_is_rejected(self):
        # "Kavya@1234567" — 13 characters, one above the 12-character maximum.
        self.assertRejected("Kavya@1234567", "too long")

    def test_uppercase_is_allowed(self):
        """A password containing an uppercase letter, alongside every other
        required class, must be accepted — uppercase is allowed, not just
        tolerated."""
        response = self._register("Kavya@123")
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertTrue(User.objects.filter(email="policy@example.com").exists())

    def test_missing_uppercase_is_rejected(self):
        # "kavya@123" — otherwise compliant, but entirely lowercase.
        self.assertRejected("kavya@123", "uppercase")

    def test_missing_lowercase_is_rejected(self):
        # "KAVYA@123" — otherwise compliant, but no lowercase letter.
        self.assertRejected("KAVYA@123", "lowercase")

    def test_missing_number_is_rejected(self):
        self.assertRejected("Kavya@abc", "number")

    def test_missing_special_character_is_rejected(self):
        # "Kavya123" — has upper/lower/number but no special character.
        self.assertRejected("Kavya1234", "special")

    def test_missing_number_and_special_character_is_rejected(self):
        """'Kavya' padded to length only — length, lowercase and uppercase
        are met, number and special are not."""
        response = self._register("KavyaKavya")
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        message = str(response.data["errors"]).lower()
        self.assertIn("number", message)
        self.assertIn("special", message)

    def test_compliant_password_is_accepted(self):
        response = self._register("Kavya@123")
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertTrue(User.objects.filter(email="policy@example.com").exists())

    def test_minimum_length_boundary_is_accepted(self):
        # "Kavya@12" — exactly 8 characters.
        response = self._register("Kavya@12")
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)

    def test_maximum_length_boundary_is_accepted(self):
        # "Kavya@123456" — exactly 12 characters.
        response = self._register("Kavya@123456")
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)

    def test_password_is_never_stored_in_plaintext(self):
        self._register("Kavya@123")
        user = User.objects.get(email="policy@example.com")
        self.assertNotEqual(user.password, "Kavya@123")
        self.assertTrue(user.check_password("Kavya@123"))

    def test_rejection_response_leaks_no_stack_trace(self):
        response = self._register("Kavya1234")
        body = str(response.data)
        self.assertNotIn("Traceback", body)
        self.assertFalse(response.data["success"])
        self.assertTrue(response.data["message"])


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


class ForgotPasswordFlowTests(APITestCase):
    """Covers the full email-based flow: forgot-password -> verify-otp
    (grants a reset_token) -> reset-password (consumes it). See
    accounts/views.py's ForgotPasswordView/VerifyResetOtpView/
    ResetPasswordView and accounts/models.py's EmailOTP for the mechanism
    being exercised. OTP delivery itself (accounts/emails.py's
    send_password_reset_otp_email, via Brevo's HTTP API) is mocked
    throughout — these tests exercise the OTP/token lifecycle, not Brevo."""

    def setUp(self):
        self.user = make_user(email="forgot@example.com", password="OldPass123")

    def _issue_reset_otp(self):
        return EmailOTP.issue(self.user, EmailOTP.Purpose.RESET, lifetime_minutes=EmailOTP.RESET_OTP_LIFETIME_MINUTES)

    def _verified_reset_token(self):
        _otp, raw_code = self._issue_reset_otp()
        response = self.client.post(
            reverse("auth-verify-reset-otp"), {"email": "forgot@example.com", "otp": raw_code}, format="json"
        )
        return response.data["data"]["reset_token"]

    @patch("accounts.views.send_password_reset_otp_email")
    def test_forgot_password_sends_email_otp_without_revealing_existence(self, mock_send_email):
        before = timezone.now()
        response = self.client.post(reverse("auth-forgot-password"), {"email": "forgot@example.com"}, format="json")
        self.assertEqual(response.status_code, status.HTTP_200_OK)

        otp = EmailOTP.objects.get(user=self.user, purpose=EmailOTP.Purpose.RESET)
        mock_send_email.assert_called_once_with(self.user, ANY, EmailOTP.RESET_OTP_LIFETIME_MINUTES)

        # expires_at is real, backend-authoritative, and exactly 6 minutes out.
        self.assertIn("expires_at", response.data["data"])
        self.assertEqual(response.data["data"]["expires_at"], otp.expires_at)
        expected_delta = timedelta(minutes=EmailOTP.RESET_OTP_LIFETIME_MINUTES)
        self.assertAlmostEqual((otp.expires_at - before).total_seconds(), expected_delta.total_seconds(), delta=5)

        unknown_response = self.client.post(
            reverse("auth-forgot-password"), {"email": "unknown@example.com"}, format="json"
        )
        self.assertEqual(unknown_response.status_code, status.HTTP_200_OK)
        self.assertEqual(unknown_response.data["message"], response.data["message"])
        # Same response shape for a non-existent account too — including
        # `expires_at` being present — so its absence/presence can never be
        # used to distinguish a real account from a fake one.
        self.assertIn("expires_at", unknown_response.data["data"])

    @patch("accounts.emails.requests.post")
    def test_forgot_password_still_succeeds_when_brevo_fails(self, mock_post):
        mock_post.side_effect = requests.exceptions.Timeout("simulated Brevo timeout")
        with self.settings(BREVO_API_KEY="test-key-not-real"):
            response = self.client.post(
                reverse("auth-forgot-password"), {"email": "forgot@example.com"}, format="json"
            )
        # A Brevo outage must not surface as an API failure or a different
        # response shape — the OTP is still generated and stored either way.
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertIn("expires_at", response.data["data"])
        self.assertTrue(EmailOTP.objects.filter(user=self.user, purpose=EmailOTP.Purpose.RESET).exists())

    @patch("accounts.emails.requests.post")
    def test_forgot_password_actually_calls_brevo_api_with_configured_credentials(self, mock_post):
        """
        Pins the real, unmocked code path all the way down to the HTTP call
        accounts/emails.py makes — this is what proves the OTP is sent
        *through Brevo* specifically, not just that some function was
        invoked. Only the network call itself (`requests.post`) is faked;
        everything above it (view -> OTP issuance -> email helper -> request
        construction) runs for real.
        """
        mock_post.return_value.raise_for_status.return_value = None

        with self.settings(
            BREVO_API_KEY="dev-key-for-test",
            BREVO_SENDER_EMAIL="sender@example.com",
            BREVO_SENDER_NAME="VR's NEXORA",
        ):
            response = self.client.post(
                reverse("auth-forgot-password"), {"email": "forgot@example.com"}, format="json"
            )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        mock_post.assert_called_once()
        call = mock_post.call_args
        self.assertEqual(call.args[0], "https://api.brevo.com/v3/smtp/email")
        self.assertEqual(call.kwargs["headers"]["api-key"], "dev-key-for-test")
        payload = call.kwargs["json"]
        self.assertEqual(payload["sender"], {"email": "sender@example.com", "name": "VR's NEXORA"})
        self.assertEqual(payload["to"], [{"email": "forgot@example.com"}])
        # The email body carries a genuine 6-digit code (the raw OTP is never
        # persisted anywhere to compare against directly — see EmailOTP.issue)
        # — proof the code is actually embedded in what Brevo is asked to
        # deliver, not just that *some* email was sent.
        self.assertRegex(payload["textContent"], r"\b\d{6}\b")
        # The API response itself, by contrast, carries only `expires_at` and
        # the generic message — never the raw code or the OTP row's hash.
        self.assertEqual(set(response.data["data"].keys()), {"expires_at"})

    def test_brevo_not_configured_skips_send_without_failing_request(self):
        """With BREVO_API_KEY unset (the local-dev default — see .env.example),
        send_password_reset_otp_email must skip the network call entirely and
        return False, while the forgot-password request still succeeds with
        its normal response shape. This is what "leave BREVO_API_KEY blank
        for local dev" actually guarantees, not just documents."""
        with self.settings(BREVO_API_KEY=""):
            with patch("accounts.emails.requests.post") as mock_post:
                response = self.client.post(
                    reverse("auth-forgot-password"), {"email": "forgot@example.com"}, format="json"
                )
                mock_post.assert_not_called()
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertTrue(EmailOTP.objects.filter(user=self.user, purpose=EmailOTP.Purpose.RESET).exists())

    def test_verify_otp_grants_reset_token(self):
        token = self._verified_reset_token()
        self.assertTrue(token)

    def test_verify_otp_rejects_wrong_code_and_tracks_attempt(self):
        otp, _raw_code = self._issue_reset_otp()
        response = self.client.post(
            reverse("auth-verify-reset-otp"), {"email": "forgot@example.com", "otp": "000000"}, format="json"
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        otp.refresh_from_db()
        self.assertEqual(otp.attempts, 1)

    def test_verify_otp_expires_after_six_minutes(self):
        otp, raw_code = self._issue_reset_otp()
        otp.expires_at = timezone.now() - timedelta(seconds=1)
        otp.save(update_fields=["expires_at"])

        response = self.client.post(
            reverse("auth-verify-reset-otp"), {"email": "forgot@example.com", "otp": raw_code}, format="json"
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_verify_otp_locks_out_after_max_attempts(self):
        otp, raw_code = self._issue_reset_otp()
        for _ in range(EmailOTP.MAX_ATTEMPTS):
            self.client.post(
                reverse("auth-verify-reset-otp"), {"email": "forgot@example.com", "otp": "000000"}, format="json"
            )

        # Even the correct code must now be rejected — the OTP is spent.
        response = self.client.post(
            reverse("auth-verify-reset-otp"), {"email": "forgot@example.com", "otp": raw_code}, format="json"
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("Too many", response.data["message"])

    @patch("accounts.views.send_password_reset_otp_email")
    def test_resend_otp_invalidates_previous_code_and_returns_fresh_expiry(self, mock_send_email):
        old_otp, old_code = self._issue_reset_otp()

        resend_response = self.client.post(
            reverse("auth-resend-otp"), {"email": "forgot@example.com", "purpose": "RESET"}, format="json"
        )
        mock_send_email.assert_called_once_with(self.user, ANY, EmailOTP.RESET_OTP_LIFETIME_MINUTES)

        new_otp = (
            EmailOTP.objects.filter(user=self.user, purpose=EmailOTP.Purpose.RESET, is_used=False)
            .order_by("-created_at")
            .first()
        )
        self.assertIsNotNone(new_otp)
        self.assertNotEqual(new_otp.pk, old_otp.pk)
        # The countdown the frontend is showing must restart from THIS value.
        self.assertEqual(resend_response.data["data"]["expires_at"], new_otp.expires_at)

        old_otp.refresh_from_db()
        self.assertTrue(old_otp.is_used)

        response = self.client.post(
            reverse("auth-verify-reset-otp"), {"email": "forgot@example.com", "otp": old_code}, format="json"
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_reset_password_with_valid_reset_token(self):
        token = self._verified_reset_token()

        response = self.client.post(
            reverse("auth-reset-password"),
            {"reset_token": token, "new_password": "NewPass@456", "confirm_password": "NewPass@456"},
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.user.refresh_from_db()
        self.assertTrue(self.user.check_password("NewPass@456"))

    def test_reset_password_rejects_mismatched_confirmation(self):
        token = self._verified_reset_token()
        response = self.client.post(
            reverse("auth-reset-password"),
            {"reset_token": token, "new_password": "NewPass@456", "confirm_password": "Different@789"},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.user.refresh_from_db()
        self.assertTrue(self.user.check_password("OldPass123"))

    def test_reset_password_rejects_reused_token(self):
        token = self._verified_reset_token()
        payload = {"reset_token": token, "new_password": "NewPass@456", "confirm_password": "NewPass@456"}
        self.client.post(reverse("auth-reset-password"), payload, format="json")

        response = self.client.post(reverse("auth-reset-password"), payload, format="json")
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_reset_password_without_verification_is_rejected(self):
        """Skipping straight to reset-password with a made-up token — frontend
        state can never substitute for a real backend-issued authorization."""
        response = self.client.post(
            reverse("auth-reset-password"),
            {"reset_token": "999999.not-a-real-secret", "new_password": "NewPass@456", "confirm_password": "NewPass@456"},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_reset_password_blacklists_existing_sessions(self):
        refresh = RefreshToken.for_user(self.user)
        token = self._verified_reset_token()

        self.client.post(
            reverse("auth-reset-password"),
            {"reset_token": token, "new_password": "NewPass@456", "confirm_password": "NewPass@456"},
            format="json",
        )

        response = self.client.post(reverse("auth-token-refresh"), {"refresh": str(refresh)}, format="json")
        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_can_login_with_new_password_and_not_with_old(self):
        token = self._verified_reset_token()
        self.client.post(
            reverse("auth-reset-password"),
            {"reset_token": token, "new_password": "NewPass@456", "confirm_password": "NewPass@456"},
            format="json",
        )

        good = self.client.post(
            reverse("auth-login"), {"email": "forgot@example.com", "password": "NewPass@456"}, format="json"
        )
        self.assertEqual(good.status_code, status.HTTP_200_OK)

        stale = self.client.post(
            reverse("auth-login"), {"email": "forgot@example.com", "password": "OldPass123"}, format="json"
        )
        self.assertEqual(stale.status_code, status.HTTP_400_BAD_REQUEST)


class VerifyEmailViewTests(APITestCase):
    def test_verify_email_with_valid_otp_activates_and_creates_profile(self):
        user = make_user(email="verify@example.com", email_verified=False)
        _otp, raw_code = EmailOTP.issue(user, EmailOTP.Purpose.REGISTER)

        response = self.client.post(
            reverse("auth-verify-email"), {"email": "verify@example.com", "otp": raw_code}, format="json"
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


class ChangePasswordViewTests(APITestCase):
    def setUp(self):
        self.user = make_user(email="changepw@example.com", password="OldPass123")

    def _payload(self, **overrides):
        payload = {"current_password": "OldPass123", "new_password": "NewPass@456", "confirm_password": "NewPass@456"}
        payload.update(overrides)
        return payload

    def test_change_password_success(self):
        self.client.force_authenticate(user=self.user)
        response = self.client.post(reverse("auth-change-password"), self._payload(), format="json")

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.user.refresh_from_db()
        self.assertTrue(self.user.check_password("NewPass@456"))

    def test_wrong_current_password_is_rejected(self):
        self.client.force_authenticate(user=self.user)
        response = self.client.post(
            reverse("auth-change-password"), self._payload(current_password="WrongPass"), format="json"
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.user.refresh_from_db()
        self.assertTrue(self.user.check_password("OldPass123"))

    def test_mismatched_confirmation_is_rejected(self):
        self.client.force_authenticate(user=self.user)
        response = self.client.post(
            reverse("auth-change-password"), self._payload(confirm_password="Different@789"), format="json"
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_weak_new_password_is_rejected(self):
        self.client.force_authenticate(user=self.user)
        response = self.client.post(
            reverse("auth-change-password"), self._payload(new_password="123", confirm_password="123"), format="json"
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_requires_authentication(self):
        response = self.client.post(reverse("auth-change-password"), self._payload(), format="json")
        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_change_password_blacklists_existing_sessions(self):
        refresh = RefreshToken.for_user(self.user)
        self.client.force_authenticate(user=self.user)
        self.client.post(reverse("auth-change-password"), self._payload(), format="json")

        response = self.client.post(reverse("auth-token-refresh"), {"refresh": str(refresh)}, format="json")
        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_can_login_with_new_password_after_change(self):
        self.client.force_authenticate(user=self.user)
        self.client.post(reverse("auth-change-password"), self._payload(), format="json")

        response = self.client.post(
            reverse("auth-login"), {"email": "changepw@example.com", "password": "NewPass@456"}, format="json"
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)


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
