from datetime import timedelta
from unittest.mock import ANY, patch

import requests
from django.core.cache import cache
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

    @patch("accounts.views.send_verification_email", return_value=True)
    def test_register_creates_unverified_user_and_emails_verification_link(self, mock_send):
        response = self.client.post(reverse("auth-register"), self._payload(), format="json")

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertTrue(response.data["success"])
        # No session until the email is verified.
        self.assertNotIn("access", response.data["data"])
        self.assertNotIn("refresh", response.data["data"])
        self.assertTrue(response.data["data"]["verification_email_sent"])

        user = User.objects.get(email="newcustomer@example.com")
        self.assertTrue(user.is_active)
        self.assertFalse(user.email_verified)
        self.assertTrue(Profile.objects.filter(user=user).exists())
        mock_send.assert_called_once_with(user, ANY)
        self.assertTrue(EmailOTP.objects.filter(user=user, purpose=EmailOTP.Purpose.REGISTER).exists())

    @patch("accounts.views.send_verification_email", return_value=False)
    def test_register_reports_when_verification_email_was_not_sent(self, _mock_send):
        response = self.client.post(reverse("auth-register"), self._payload(), format="json")

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertFalse(response.data["data"]["verification_email_sent"])
        self.assertIn("couldn't send", response.data["message"])

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
        cache.clear()  # throttle counters are cached per email
        self.user = make_user(email="forgot@example.com", password="OldPass123")

    def _issue_reset_otp(self):
        return EmailOTP.issue(self.user, EmailOTP.Purpose.RESET, lifetime_minutes=EmailOTP.RESET_OTP_LIFETIME_MINUTES)

    def _verified_reset_token(self):
        _otp, raw_code = self._issue_reset_otp()
        response = self.client.post(
            reverse("auth-verify-reset-otp"), {"email": "forgot@example.com", "otp": raw_code}, format="json"
        )
        return response.data["data"]["reset_token"]

    @patch("accounts.views._send_in_background", side_effect=lambda fn, *args: fn(*args))
    @patch("accounts.views.send_password_reset_otp_email", return_value=True)
    def test_forgot_password_emails_otp_without_revealing_existence(self, mock_send, _sync):
        before = timezone.now()
        response = self.client.post(reverse("auth-forgot-password"), {"email": "forgot@example.com"}, format="json")
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        mock_send.assert_called_once_with(self.user, ANY, EmailOTP.RESET_OTP_LIFETIME_MINUTES)
        self.assertRegex(mock_send.call_args.args[1], r"^\d{6}$")

        otp = EmailOTP.objects.get(user=self.user, purpose=EmailOTP.Purpose.RESET)
        self.assertEqual(response.data["data"]["expires_at"], otp.expires_at)
        self.assertAlmostEqual((otp.expires_at - before).total_seconds(), 5 * 60, delta=5)

        unknown_response = self.client.post(
            reverse("auth-forgot-password"), {"email": "unknown@example.com"}, format="json"
        )
        self.assertEqual(unknown_response.status_code, status.HTTP_200_OK)
        # Same message and shape (including expires_at) for a non-existent
        # account, and no email attempted.
        self.assertEqual(unknown_response.data["message"], response.data["message"])
        self.assertEqual(set(unknown_response.data["data"]), {"expires_at"})
        mock_send.assert_called_once()

    @patch("accounts.views._send_in_background", side_effect=lambda fn, *args: fn(*args))
    @patch("accounts.emails.requests.post")
    def test_forgot_password_still_succeeds_when_brevo_fails(self, mock_post, _sync):
        mock_post.side_effect = requests.exceptions.Timeout("simulated Brevo timeout")
        with self.settings(BREVO_API_KEY="test-key-not-real"):
            response = self.client.post(
                reverse("auth-forgot-password"), {"email": "forgot@example.com"}, format="json"
            )
        # A Brevo outage must not change the response — that would reveal
        # that the account exists.
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertTrue(EmailOTP.objects.filter(user=self.user, purpose=EmailOTP.Purpose.RESET).exists())

    @patch("accounts.views._send_in_background", side_effect=lambda fn, *args: fn(*args))
    @patch("accounts.emails.requests.post")
    def test_forgot_password_actually_calls_brevo_api_with_configured_credentials(self, mock_post, _sync):
        """Only the network call itself is faked — view, token issuance,
        template rendering and request construction all run for real."""
        mock_post.return_value.status_code = 201

        with self.settings(
            BREVO_API_KEY="dev-key-for-test",
            BREVO_SENDER_EMAIL="sender@example.com",
            BREVO_SENDER_NAME="VR's GATEWAY",
            FRONTEND_URL="https://app.example.com",
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
        self.assertEqual(payload["sender"], {"email": "sender@example.com", "name": "VR's GATEWAY"})
        self.assertEqual(payload["to"], [{"email": "forgot@example.com"}])
        # The email carries a real 6-digit code and no link.
        self.assertRegex(payload["textContent"], r"\b\d{6}\b")
        self.assertRegex(payload["htmlContent"], r">\d{6}<")
        self.assertNotIn("reset-password?token=", payload["htmlContent"])
        # The API response only carries the expiry — never the code.
        self.assertEqual(set(response.data["data"]), {"expires_at"})

    def test_brevo_not_configured_skips_send_without_failing_request(self):
        with self.settings(BREVO_API_KEY=""):
            with patch("accounts.views._send_in_background", side_effect=lambda fn, *args: fn(*args)):
                with patch("accounts.emails.requests.post") as mock_post:
                    response = self.client.post(
                        reverse("auth-forgot-password"), {"email": "forgot@example.com"}, format="json"
                    )
                    mock_post.assert_not_called()
        self.assertEqual(response.status_code, status.HTTP_200_OK)

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

    @patch("accounts.views._send_in_background", side_effect=lambda fn, *args: fn(*args))
    @patch("accounts.views.send_password_reset_otp_email", return_value=True)
    def test_resend_otp_invalidates_previous_code_and_returns_fresh_expiry(self, mock_send, _sync):
        old_otp, old_code = self._issue_reset_otp()

        resend_response = self.client.post(
            reverse("auth-resend-otp"), {"email": "forgot@example.com", "purpose": "RESET"}, format="json"
        )
        self.assertEqual(resend_response.status_code, status.HTTP_200_OK)
        mock_send.assert_called_once_with(self.user, ANY, EmailOTP.RESET_OTP_LIFETIME_MINUTES)
        new_otp = EmailOTP.objects.filter(user=self.user, purpose=EmailOTP.Purpose.RESET, is_used=False).get()
        self.assertNotEqual(new_otp.pk, old_otp.pk)
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
    def setUp(self):
        cache.clear()
        self.user = make_user(email="verify@example.com", email_verified=False)

    def _verify(self, token):
        return self.client.post(reverse("auth-verify-email"), {"token": token}, format="json")

    def test_valid_link_verifies_email_and_allows_login(self):
        token = EmailOTP.issue_verification_link(self.user)

        response = self._verify(token)

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertFalse(response.data["data"]["already_verified"])
        self.user.refresh_from_db()
        self.assertTrue(self.user.email_verified)
        self.assertTrue(Profile.objects.filter(user=self.user).exists())
        login = self.client.post(
            reverse("auth-login"), {"email": "verify@example.com", "password": "StrongPass123"}, format="json"
        )
        self.assertEqual(login.status_code, status.HTTP_200_OK)

    def test_reusing_a_link_reports_already_verified(self):
        token = EmailOTP.issue_verification_link(self.user)
        self._verify(token)

        response = self._verify(token)

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertTrue(response.data["data"]["already_verified"])

    def test_expired_link_is_rejected(self):
        token = EmailOTP.issue_verification_link(self.user)
        EmailOTP.objects.filter(user=self.user).update(expires_at=timezone.now() - timedelta(seconds=1))

        response = self._verify(token)

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(response.data["errors"]["code"], "token_expired")
        self.user.refresh_from_db()
        self.assertFalse(self.user.email_verified)

    def test_link_superseded_by_a_newer_one_is_rejected(self):
        old_token = EmailOTP.issue_verification_link(self.user)
        new_token = EmailOTP.issue_verification_link(self.user)

        self.assertEqual(self._verify(old_token).data["errors"]["code"], "token_invalid")
        self.assertEqual(self._verify(new_token).status_code, status.HTTP_200_OK)

    def test_tampered_or_malformed_tokens_are_rejected(self):
        token = EmailOTP.issue_verification_link(self.user)
        pk = token.split(".", 1)[0]
        for bad in (f"{pk}.wrong-secret", "not-a-token", "999999.whatever", ""):
            response = self._verify(bad)
            self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST, bad)
        self.user.refresh_from_db()
        self.assertFalse(self.user.email_verified)

    def test_only_the_secret_hash_is_stored(self):
        token = EmailOTP.issue_verification_link(self.user)
        secret = token.split(".", 1)[1]
        otp = EmailOTP.objects.get(user=self.user, purpose=EmailOTP.Purpose.REGISTER)
        self.assertNotIn(secret, otp.code_hash)

    @patch("accounts.views._send_in_background", side_effect=lambda fn, *args: fn(*args))
    @patch("accounts.views.send_verification_email", return_value=True)
    def test_resend_verification_sends_new_link_only_when_needed(self, mock_send, _sync):
        url = reverse("auth-resend-otp")
        unverified = self.client.post(url, {"email": "verify@example.com", "purpose": "REGISTER"}, format="json")
        mock_send.assert_called_once_with(self.user, ANY)

        make_user(email="done@example.com")  # already verified
        verified = self.client.post(url, {"email": "done@example.com", "purpose": "REGISTER"}, format="json")
        unknown = self.client.post(url, {"email": "nobody@example.com", "purpose": "REGISTER"}, format="json")

        mock_send.assert_called_once()
        # Same reply in all three cases — nothing reveals account state.
        self.assertEqual(unverified.data, verified.data)
        self.assertEqual(unverified.data, unknown.data)


class UnverifiedLoginTests(APITestCase):
    def test_unverified_customer_cannot_log_in(self):
        make_user(email="pending@example.com", email_verified=False)
        response = self.client.post(
            reverse("auth-login"), {"email": "pending@example.com", "password": "StrongPass123"}, format="json"
        )
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)
        self.assertEqual(response.data["errors"]["code"], "email_not_verified")
        self.assertNotIn("access", response.data.get("data") or {})

    def test_wrong_password_never_reveals_verification_status(self):
        make_user(email="pending@example.com", email_verified=False)
        response = self.client.post(
            reverse("auth-login"), {"email": "pending@example.com", "password": "Wrong@123"}, format="json"
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertNotIn("code", response.data.get("errors") or {})

    def test_admin_is_never_blocked(self):
        make_user(email="boss@example.com", role=User.Role.ADMIN, email_verified=False)
        response = self.client.post(
            reverse("auth-login"), {"email": "boss@example.com", "password": "StrongPass123"}, format="json"
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)


class ResetOtpFlowTests(APITestCase):
    """The full popup flow over HTTP: forgot-password emails a code ->
    verify-reset-otp grants a reset token -> reset-password consumes it."""

    def setUp(self):
        cache.clear()
        self.user = make_user(email="otpflow@example.com", password="OldPass123", email_verified=False)

    def _request_code(self, url_name="auth-forgot-password", **extra):
        with patch("accounts.views.send_password_reset_otp_email", return_value=True) as mock_send, patch(
            "accounts.views._send_in_background", side_effect=lambda fn, *args: fn(*args)
        ):
            response = self.client.post(reverse(url_name), {"email": "otpflow@example.com", **extra}, format="json")
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        return mock_send.call_args.args[1]

    def _verify(self, code):
        return self.client.post(
            reverse("auth-verify-reset-otp"), {"email": "otpflow@example.com", "otp": code}, format="json"
        )

    def _reset(self, token, password="NewPass@456"):
        return self.client.post(
            reverse("auth-reset-password"),
            {"reset_token": token, "new_password": password, "confirm_password": password},
            format="json",
        )

    def test_full_flow_then_code_and_token_cannot_be_reused(self):
        code = self._request_code()
        verify = self._verify(code)
        self.assertEqual(verify.status_code, status.HTTP_200_OK)
        token = verify.data["data"]["reset_token"]

        # The code works only once.
        self.assertEqual(self._verify(code).status_code, status.HTTP_400_BAD_REQUEST)

        self.assertEqual(self._reset(token).status_code, status.HTTP_200_OK)
        self.user.refresh_from_db()
        self.assertTrue(self.user.check_password("NewPass@456"))
        self.assertTrue(self.user.email_verified)  # the code proved inbox ownership

        reuse = self._reset(token, "Other@789")
        self.assertEqual(reuse.status_code, status.HTTP_400_BAD_REQUEST)
        login = self.client.post(
            reverse("auth-login"), {"email": "otpflow@example.com", "password": "NewPass@456"}, format="json"
        )
        self.assertEqual(login.status_code, status.HTTP_200_OK)

    def test_code_expires_after_five_minutes(self):
        code = self._request_code()
        EmailOTP.objects.filter(user=self.user, purpose=EmailOTP.Purpose.RESET).update(
            expires_at=timezone.now() - timedelta(seconds=1)
        )
        self.assertEqual(self._verify(code).status_code, status.HTTP_400_BAD_REQUEST)

    def test_resent_code_replaces_the_old_one(self):
        old_code = self._request_code()
        new_code = self._request_code("auth-resend-otp", purpose="RESET")
        if old_code != new_code:  # 1-in-a-million chance they collide
            self.assertEqual(self._verify(old_code).status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(self._verify(new_code).status_code, status.HTTP_200_OK)

    def test_requesting_a_new_code_cancels_an_unused_reset_token(self):
        token = self._verify(self._request_code()).data["data"]["reset_token"]
        self._request_code()
        self.assertEqual(self._reset(token).status_code, status.HTTP_400_BAD_REQUEST)

    def test_weak_password_is_rejected_and_token_stays_usable(self):
        token = self._verify(self._request_code()).data["data"]["reset_token"]
        self.assertEqual(self._reset(token, "weak").status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(self._reset(token).status_code, status.HTTP_200_OK)

    def test_forgot_and_resend_are_rate_limited_per_email(self):
        url = reverse("auth-forgot-password")
        with patch("accounts.views._send_in_background"):
            statuses = [
                self.client.post(url, {"email": "otpflow@example.com"}, format="json").status_code for _ in range(6)
            ]
            resend = self.client.post(
                reverse("auth-resend-otp"), {"email": "otpflow@example.com", "purpose": "RESET"}, format="json"
            )
        self.assertEqual(statuses[:5], [200] * 5)
        self.assertEqual(statuses[5], status.HTTP_429_TOO_MANY_REQUESTS)
        self.assertEqual(resend.status_code, status.HTTP_429_TOO_MANY_REQUESTS)


class BrevoEmailTests(APITestCase):
    def setUp(self):
        self.user = make_user(email="mail@example.com")

    @patch("accounts.emails.requests.post")
    def test_rejected_send_returns_false_and_never_logs_the_token(self, mock_post):
        from .emails import send_password_reset_otp_email

        mock_post.return_value.status_code = 401
        mock_post.return_value.json.return_value = {"code": "unauthorized", "message": "Key not found"}
        with self.settings(BREVO_API_KEY="bad-key"), self.assertLogs("accounts.email", level="ERROR") as logs:
            sent = send_password_reset_otp_email(self.user, "839201", 5)

        self.assertFalse(sent)
        output = "\n".join(logs.output)
        self.assertIn("status=401", output)
        self.assertIn("unauthorized", output)
        self.assertNotIn("839201", output)
        self.assertNotIn("bad-key", output)

    @patch("accounts.emails.requests.post")
    def test_production_refuses_non_https_links(self, mock_post):
        from .emails import send_verification_email

        with self.settings(BREVO_API_KEY="key", DJANGO_ENV="production", FRONTEND_URL="http://insecure.example.com"):
            self.assertFalse(send_verification_email(self.user, "1.secret"))
        mock_post.assert_not_called()

    @patch("accounts.emails.requests.post")
    def test_user_name_is_html_escaped_in_the_email(self, mock_post):
        from .emails import send_verification_email

        mock_post.return_value.status_code = 201
        self.user.full_name = "<script>alert(1)</script>"
        with self.settings(BREVO_API_KEY="key", FRONTEND_URL="http://localhost:5173"):
            self.assertTrue(send_verification_email(self.user, "1.secret"))
        payload = mock_post.call_args.kwargs["json"]
        self.assertNotIn("<script>", payload["htmlContent"])
        self.assertIn("http://localhost:5173/verify-email?token=1.secret", payload["htmlContent"])


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
