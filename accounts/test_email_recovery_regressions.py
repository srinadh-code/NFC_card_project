"""Offline recovery coverage for legacy email spelling and async failures."""

from types import SimpleNamespace
from unittest.mock import Mock, patch

from django.core.cache import cache
from django.test import SimpleTestCase
from django.urls import reverse
from rest_framework.test import APITestCase

from accounts import views
from accounts.models import EmailOTP, User
from common.test_utils import make_user


class LegacyEmailRecoveryTests(APITestCase):
    def setUp(self):
        cache.clear()
        self.addCleanup(cache.clear)
        self.user = make_user(email="legacy.recovery@example.com", password="Original@123")
        # Historical rows can retain spelling predating normalized creation.
        User.objects.filter(pk=self.user.pk).update(email="Legacy.Recovery@EXAMPLE.COM")
        self.user.refresh_from_db()

    def test_forgot_verify_reset_and_login_reuse_the_legacy_account(self):
        with patch("accounts.views.send_password_reset_otp_email", return_value=True) as send, patch(
            "accounts.views._send_in_background", side_effect=lambda fn, *args: fn(*args)
        ):
            requested = self.client.post(reverse("auth-forgot-password"), {
                "email": "  LEGACY.RECOVERY@example.com  ",
            }, format="json")
        self.assertEqual(requested.status_code, 200, requested.content)
        send.assert_called_once()
        self.assertEqual(send.call_args.args[0].pk, self.user.pk)
        self.assertEqual(send.call_args.args[0].email, self.user.email)
        self.assertEqual(send.call_args.args[2], EmailOTP.RESET_OTP_LIFETIME_MINUTES)
        verified = self.client.post(reverse("auth-verify-reset-otp"), {
            "email": "legacy.recovery@EXAMPLE.com", "otp": send.call_args.args[1],
        }, format="json")
        self.assertEqual(verified.status_code, 200, verified.content)
        reset = self.client.post(reverse("auth-reset-password"), {
            "reset_token": verified.data["data"]["reset_token"],
            "new_password": "Recover@456", "confirm_password": "Recover@456",
        }, format="json")
        self.assertEqual(reset.status_code, 200, reset.content)
        login = self.client.post(reverse("auth-login"), {
            "email": "LEGACY.RECOVERY@example.com", "password": "Recover@456",
        }, format="json")
        self.assertEqual(login.status_code, 200, login.content)
        self.assertEqual(login.data["data"]["user"]["id"], self.user.pk)
        self.user.refresh_from_db()
        self.assertEqual(self.user.email, "Legacy.Recovery@EXAMPLE.COM")
        self.assertEqual(User.objects.count(), 1)

    def test_reset_resend_for_legacy_email_supersedes_old_code(self):
        with patch.object(EmailOTP, "generate_code", side_effect=["111111", "222222"]):
            old, old_code = EmailOTP.issue(self.user, EmailOTP.Purpose.RESET)
            with patch("accounts.views.send_password_reset_otp_email", return_value=True) as send, patch(
                "accounts.views._send_in_background", side_effect=lambda fn, *args: fn(*args)
            ):
                response = self.client.post(reverse("auth-resend-otp"), {
                    "email": "legacy.recovery@example.com", "purpose": "RESET",
                }, format="json")
        self.assertEqual(response.status_code, 200, response.content)
        send.assert_called_once()
        self.assertEqual(send.call_args.args[0].pk, self.user.pk)
        old.refresh_from_db()
        self.assertTrue(old.is_used)
        stale = self.client.post(reverse("auth-verify-reset-otp"), {
            "email": "legacy.recovery@example.com", "otp": old_code,
        }, format="json")
        current = self.client.post(reverse("auth-verify-reset-otp"), {
            "email": "LEGACY.RECOVERY@example.com", "otp": send.call_args.args[1],
        }, format="json")
        self.assertEqual(stale.status_code, 400)
        self.assertEqual(current.status_code, 200, current.content)

    def test_verification_resend_uses_legacy_email_without_revealing_account_state(self):
        self.user.email_verified = False
        self.user.save(update_fields=["email_verified"])
        old_token = EmailOTP.issue_verification_link(self.user)
        with patch("accounts.views.send_verification_email", return_value=True) as send, patch(
            "accounts.views._send_in_background", side_effect=lambda fn, *args: fn(*args)
        ):
            response = self.client.post(reverse("auth-resend-otp"), {
                "email": "legacy.recovery@example.com", "purpose": "REGISTER",
            }, format="json")
            unknown = self.client.post(reverse("auth-resend-otp"), {
                "email": "unknown@example.com", "purpose": "REGISTER",
            }, format="json")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data, unknown.data)
        send.assert_called_once()
        self.assertEqual(send.call_args.args[0].pk, self.user.pk)
        self.assertEqual(EmailOTP.check_verification_link(old_token)[0], EmailOTP.LINK_INVALID)
        self.assertEqual(EmailOTP.check_verification_link(send.call_args.args[1])[0], EmailOTP.LINK_VALID)

    def test_disabled_and_pending_accounts_remain_ineligible(self):
        for active, pending in ((False, False), (True, True)):
            with self.subTest(active=active, pending=pending):
                self.user.is_active = active
                self.user.must_change_password = pending
                self.user.save(update_fields=["is_active", "must_change_password"])
                _, code = EmailOTP.issue(self.user, EmailOTP.Purpose.RESET)
                with patch("accounts.views._send_in_background") as send:
                    forgot = self.client.post(reverse("auth-forgot-password"), {
                        "email": "legacy.recovery@example.com",
                    }, format="json")
                    resend = self.client.post(reverse("auth-resend-otp"), {
                        "email": "legacy.recovery@example.com", "purpose": "RESET",
                    }, format="json")
                self.assertEqual(forgot.status_code, 200)
                self.assertEqual(resend.status_code, 200)
                send.assert_not_called()
                verify = self.client.post(reverse("auth-verify-reset-otp"), {
                    "email": "legacy.recovery@example.com", "otp": code,
                }, format="json")
                self.assertEqual(verify.status_code, 400)

    def test_async_sender_failure_preserves_generic_recovery_response(self):
        with patch("accounts.views.threading.Thread") as thread, patch(
            "accounts.views.send_password_reset_otp_email", return_value=False
        ) as sender:
            known = self.client.post(reverse("auth-forgot-password"), {
                "email": "legacy.recovery@example.com",
            }, format="json")
            sender.assert_not_called()
            thread.assert_called_once()
            thread.return_value.start.assert_called_once()
            self.assertTrue(thread.call_args.kwargs["daemon"])
            with patch("accounts.views.connection"), self.assertLogs("accounts.auth", level="WARNING"):
                thread.call_args.kwargs["target"]()
            unknown = self.client.post(reverse("auth-forgot-password"), {
                "email": "unknown@example.com",
            }, format="json")
        self.assertEqual(known.status_code, 200)
        self.assertEqual(known.data["message"], unknown.data["message"])
        self.assertEqual(set(known.data["data"]), {"expires_at"})
        self.assertEqual(set(unknown.data["data"]), {"expires_at"})
        sender.assert_called_once()


class BackgroundEmailObservabilityTests(SimpleTestCase):
    def _run_sender(self, sender, *args):
        with patch("accounts.views.threading.Thread") as thread, patch("accounts.views.connection") as connection:
            views._send_in_background(sender, *args)
            sender.assert_not_called()
            thread.return_value.start.assert_called_once()
            self.assertTrue(thread.call_args.kwargs["daemon"])
            thread.call_args.kwargs["target"]()
            connection.close.assert_called_once()

    def test_rejected_sender_logs_only_safe_category(self):
        sender = Mock(return_value=False)
        sender.__name__ = "send_password_reset_otp_email"
        secret = "credential-private-123456"
        with self.assertLogs("accounts.auth", level="WARNING") as logged:
            self._run_sender(sender, SimpleNamespace(email="private@example.com"), secret, 5)
        self.assertEqual(logged.output, [
            "WARNING:accounts.auth:auth.email.failed purpose=reset_password_otp reason=sender_rejected",
        ])
        self.assertNotIn(secret, "\n".join(logged.output))
        self.assertNotIn("private@example.com", "\n".join(logged.output))

    def test_unexpected_sender_exception_is_contained_without_private_details(self):
        secret = "private@example.com OTP=654321 token=private-key"
        sender = Mock(side_effect=RuntimeError(secret))
        sender.__name__ = "send_verification_email"
        with self.assertLogs("accounts.auth", level="ERROR") as logged:
            self._run_sender(sender, secret)
        self.assertEqual(logged.output, [
            "ERROR:accounts.auth:auth.email.failed purpose=verify_email reason=sender_exception",
        ])
        self.assertNotIn(secret, "\n".join(logged.output))
        self.assertIsNone(logged.records[0].exc_info)

    def test_unknown_sender_name_is_not_written_to_logs(self):
        sender = Mock(return_value=False)
        sender.__name__ = "private-name-with-token"
        with self.assertLogs("accounts.auth", level="WARNING") as logged:
            self._run_sender(sender)
        self.assertIn("purpose=auth_email", logged.output[0])
        self.assertNotIn(sender.__name__, logged.output[0])

    def test_successful_sender_does_not_emit_a_failure(self):
        with self.assertNoLogs("accounts.auth", level="WARNING"):
            self._run_sender(Mock(return_value=True))
