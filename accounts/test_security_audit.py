"""Security regression tests for the approved authentication hardening.

Run with config.security_test_settings. External identity/email providers are
mocked, credentials are synthetic, and the database is an isolated test DB.
PostgreSQL locking semantics require an explicitly isolated PostgreSQL test DB.
"""

from datetime import timedelta
from contextlib import redirect_stdout
from concurrent.futures import ThreadPoolExecutor
from io import StringIO
import time
from unittest.mock import patch

from django.core.cache import cache
from django.db import close_old_connections
from django.test import TransactionTestCase, override_settings, skipUnlessDBFeature
from django.urls import reverse
from django.utils import timezone
from rest_framework.test import APITestCase
from rest_framework_simplejwt.tokens import AccessToken, RefreshToken

from accounts import onboarding
from accounts.models import CustomerOnboarding, EmailOTP
from common.test_utils import make_user
from orders.models import Order, OrderRecipient
from payments import verification
from payments.models import CheckoutVerification
from website_content.models import SecuritySettings


@override_settings(PASSWORD_HASHERS=["django.contrib.auth.hashers.MD5PasswordHasher"])
class AuthenticationAuditTests(APITestCase):
    def setUp(self):
        cache.clear()
        self.addCleanup(cache.clear)
        self.user = make_user(email="audit-account@example.com", password="Audit@123")

    def test_auth01_login_obeys_admin_access_token_lifetime(self):
        SecuritySettings.objects.update_or_create(pk=1, defaults={"access_token_minutes": 3})
        response = self.client.post(
            reverse("auth-login"),
            {"email": self.user.email, "password": "Audit@123"},
            format="json",
        )
        self.assertEqual(response.status_code, 200)
        token = AccessToken(response.data["data"]["access"])
        self.assertEqual(token["exp"] - token["iat"], 3 * 60)

    def test_auth01_refresh_obeys_admin_access_token_lifetime(self):
        SecuritySettings.objects.update_or_create(pk=1, defaults={"access_token_minutes": 3})
        refresh = RefreshToken.for_user(self.user)
        response = self.client.post(
            reverse("auth-token-refresh"), {"refresh": str(refresh)}, format="json"
        )
        self.assertEqual(response.status_code, 200)
        token = AccessToken(response.data["access"])
        self.assertEqual(token["exp"] - token["iat"], 3 * 60)

    def test_refresh_keeps_raw_contract_and_rotates_with_updated_admin_lifetime(self):
        refresh = RefreshToken.for_user(self.user)
        SecuritySettings.objects.update_or_create(pk=1, defaults={"access_token_minutes": 4})
        response = self.client.post(
            reverse("auth-token-refresh"), {"refresh": str(refresh)}, format="json"
        )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(set(response.data), {"access", "refresh"})
        access = AccessToken(response.data["access"])
        self.assertEqual(access["exp"] - access["iat"], 4 * 60)
        self.assertEqual(self.client.post(
            reverse("auth-token-refresh"), {"refresh": str(refresh)}, format="json"
        ).status_code, 401)

    def test_refresh_cannot_issue_tokens_for_disabled_or_pending_account(self):
        for inactive, pending in [(True, False), (False, True)]:
            with self.subTest(inactive=inactive, pending=pending):
                self.user.is_active = True
                self.user.must_change_password = False
                self.user.save(update_fields=["is_active", "must_change_password"])
                refresh = RefreshToken.for_user(self.user)
                self.user.is_active = not inactive
                self.user.must_change_password = pending
                self.user.save(update_fields=["is_active", "must_change_password"])
                response = self.client.post(
                    reverse("auth-token-refresh"), {"refresh": str(refresh)}, format="json"
                )
                self.assertEqual(response.status_code, 401)
                self.assertNotIn("access", response.data)

    def test_auth02_stale_otp_reads_cannot_exceed_wrong_guess_limit(self):
        # Read all instances before writing: the deterministic interleaving
        # reproduces concurrent requests without relying on SQLite threads.
        otp, raw_code = EmailOTP.issue(self.user, EmailOTP.Purpose.RESET)
        stale_reads = [EmailOTP.objects.get(pk=otp.pk) for _ in range(EmailOTP.MAX_ATTEMPTS + 1)]
        wrong_code = "000000" if raw_code != "000000" else "111111"
        for stale in stale_reads[:-1]:
            self.assertFalse(stale.check_code(wrong_code))
        self.assertFalse(stale_reads[-1].check_code(raw_code))

    def test_auth03_logout_cannot_revoke_another_accounts_refresh(self):
        other = make_user(email="audit-other@example.com")
        other_refresh = RefreshToken.for_user(other)
        self.client.force_authenticate(user=self.user)
        response = self.client.post(
            reverse("auth-logout"), {"refresh": str(other_refresh)}, format="json"
        )
        self.assertIn(response.status_code, (400, 403))
        self.client.force_authenticate(user=None)
        response = self.client.post(
            reverse("auth-token-refresh"), {"refresh": str(other_refresh)}, format="json"
        )
        self.assertEqual(response.status_code, 200)

    def test_auth04_google_cannot_issue_tokens_for_disabled_account(self):
        self.user.is_active = False
        self.user.save(update_fields=["is_active"])
        claims = {
            "sub": "audit-google-subject", "email": self.user.email,
            "email_verified": True, "name": "Audit User",
        }
        with patch("accounts.views.verify_google_id_token", return_value=claims):
            response = self.client.post(reverse("auth-google"), {"credential": "synthetic"}, format="json")
        self.assertIn(response.status_code, (400, 401, 403))
        self.assertNotIn("access", response.data.get("data") or {})

    @override_settings(DJANGO_ENV="production", FRONTEND_URL="http://insecure.example.com")
    def test_auth05_recipient_activation_rejects_plain_http_in_production(self):
        self.assertIsNone(onboarding._activation_url("synthetic-token"))

    @override_settings(
        DJANGO_ENV="production", FRONTEND_URL="https://secure.example.com",
        EMAIL_BACKEND="django.core.mail.backends.console.EmailBackend", EMAIL_HOST="", BREVO_API_KEY="",
    )
    def test_auth05_recipient_activation_never_prints_credentials_to_console(self):
        self.user.must_change_password = True
        self.user.save(update_fields=["must_change_password"])
        order = Order.objects.create(
            customer=self.user, amount="1.00", payment_method=Order.PaymentMethod.DUMMY,
            payment_status=Order.PaymentStatus.PAID, shipping_line1="Test address",
            shipping_city="Test city", shipping_state="Test state", shipping_pincode="500001",
        )
        OrderRecipient.objects.create(order=order, user=self.user, email=self.user.email, name="Test Recipient")
        record = CustomerOnboarding.objects.create(user=self.user, source_order=order)
        raw_token = EmailOTP.issue_activation_link(self.user, lifetime_hours=1)
        console = StringIO()
        with redirect_stdout(console):
            delivered = onboarding.deliver_activation_email(record.pk, raw_token)
        self.assertNotIn(raw_token, console.getvalue())
        self.assertFalse(delivered)

    def test_invalid_and_expired_access_tokens_cannot_access_me(self):
        expired = AccessToken.for_user(self.user)
        expired.set_exp(lifetime=timedelta(seconds=-1))
        for raw_token in ("malformed-token", str(expired)):
            with self.subTest(raw_token_type="expired" if raw_token != "malformed-token" else "malformed"):
                response = self.client.get(reverse("auth-me"), HTTP_AUTHORIZATION=f"Bearer {raw_token}")
                self.assertEqual(response.status_code, 401)

    def test_password_reset_authorization_is_single_use(self):
        otp, code = EmailOTP.issue(self.user, EmailOTP.Purpose.RESET)
        verification = self.client.post(
            reverse("auth-verify-reset-otp"), {"email": self.user.email, "otp": code}, format="json"
        )
        self.assertEqual(verification.status_code, 200)
        token = verification.data["data"]["reset_token"]
        payload = {"reset_token": token, "new_password": "Fresh@123", "confirm_password": "Fresh@123"}
        self.assertEqual(self.client.post(reverse("auth-reset-password"), payload, format="json").status_code, 200)
        self.assertEqual(self.client.post(reverse("auth-reset-password"), payload, format="json").status_code, 400)
        self.user.refresh_from_db()
        self.assertTrue(self.user.check_password("Fresh@123"))
        self.assertIsNone(EmailOTP.get_by_reset_token(token))


class CheckoutOtpAuditTests(APITestCase):
    def setUp(self):
        self.code = "123456"
        self.challenge = CheckoutVerification.objects.create(
            channel=CheckoutVerification.Channel.EMAIL, destination="checkout-audit@example.com",
            session_ref="audit-checkout", code_hash=verification._digest(self.code),
            expires_at=timezone.now() + timedelta(minutes=5),
        )

    def _verify(self, code):
        return verification.verify_code(
            CheckoutVerification.Channel.EMAIL, self.challenge.destination, code,
            session_ref=self.challenge.session_ref,
        )

    def test_checkout_otp_cannot_be_reused_and_token_stays_bound_to_checkout(self):
        token = self._verify(self.code)
        with self.assertRaises(verification.VerificationError):
            self._verify(self.code)
        # Verification credentials deliberately permit payment retries for
        # the same browser checkout while their short lifetime is valid.
        for _ in range(2):
            self.assertTrue(verification.check_token(
                CheckoutVerification.Channel.EMAIL, self.challenge.destination, token, "audit-checkout"
            ))
        self.assertFalse(verification.check_token(
            CheckoutVerification.Channel.EMAIL, self.challenge.destination, token, "different-checkout"
        ))
        self.assertFalse(verification.check_token(
            CheckoutVerification.Channel.EMAIL, "different@example.com", token, "audit-checkout"
        ))

    def test_checkout_wrong_guess_updates_survive_verification_errors(self):
        for _ in range(verification.MAX_ATTEMPTS):
            with self.assertRaises(verification.VerificationError):
                self._verify("000000")
        self.challenge.refresh_from_db()
        self.assertEqual(self.challenge.attempts, verification.MAX_ATTEMPTS)
        self.assertEqual(self.challenge.code_hash, "")
        with self.assertRaises(verification.VerificationError):
            self._verify(self.code)

    def test_checkout_expiry_cleanup_survives_verification_error(self):
        self.challenge.expires_at = timezone.now() - timedelta(seconds=1)
        self.challenge.save(update_fields=["expires_at"])
        with self.assertRaises(verification.VerificationError):
            self._verify(self.code)
        self.challenge.refresh_from_db()
        self.assertEqual(self.challenge.code_hash, "")

    def test_concurrent_send_rows_cannot_restore_an_older_code_after_latest_is_used(self):
        # Deterministic result of two concurrent sends inserting live rows.
        latest_code = "654321"
        CheckoutVerification.objects.create(
            channel=self.challenge.channel, destination=self.challenge.destination,
            session_ref=self.challenge.session_ref, code_hash=verification._digest(latest_code),
            expires_at=timezone.now() + timedelta(minutes=5),
        )
        self._verify(latest_code)
        with self.assertRaises(verification.VerificationError):
            self._verify(self.code)

    def test_newer_challenge_in_another_session_supersedes_older_live_code(self):
        CheckoutVerification.objects.create(
            channel=self.challenge.channel, destination=self.challenge.destination,
            session_ref="newer-browser-checkout", code_hash=verification._digest("654321"),
            expires_at=timezone.now() + timedelta(minutes=5),
        )
        with self.assertRaises(verification.VerificationError):
            self._verify(self.code)


class PostgreSQLCheckoutOtpConcurrencyAuditTests(TransactionTestCase):
    @skipUnlessDBFeature("has_select_for_update")
    def test_checkout_concurrent_wrong_guesses_cannot_overwrite_attempt_budget(self):
        # Run on an explicitly isolated PostgreSQL test database to verify
        # row-lock semantics. SQLite's test database cannot validate this.
        challenge = CheckoutVerification.objects.create(
            channel=CheckoutVerification.Channel.EMAIL, destination="parallel-audit@example.com",
            session_ref="parallel-checkout", code_hash=verification._digest("123456"),
            expires_at=timezone.now() + timedelta(minutes=5),
        )
        real_compare = verification.hmac.compare_digest

        def slow_compare(*args):
            # Widen the read/write overlap; a correct lock serializes this
            # harmless delay while an unprotected flow loses increments.
            time.sleep(0.03)
            return real_compare(*args)

        def wrong_guess(_):
            close_old_connections()
            try:
                verification.verify_code(
                    CheckoutVerification.Channel.EMAIL, challenge.destination, "000000", challenge.session_ref
                )
            except verification.VerificationError:
                return
            finally:
                close_old_connections()
            self.fail("A wrong code was accepted")

        with patch("payments.verification.hmac.compare_digest", side_effect=slow_compare):
            with ThreadPoolExecutor(max_workers=verification.MAX_ATTEMPTS + 1) as pool:
                list(pool.map(wrong_guess, range(verification.MAX_ATTEMPTS + 1)))
        challenge.refresh_from_db()
        self.assertEqual(challenge.attempts, verification.MAX_ATTEMPTS)
        self.assertEqual(challenge.code_hash, "")
