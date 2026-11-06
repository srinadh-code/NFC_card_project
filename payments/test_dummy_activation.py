"""Dummy payment -> admin Processing -> activation email -> set password ->
login. Covers the failure paths too: disabled dummy payments, amount
tampering, duplicate confirmation, unpaid orders, duplicate activation
emails, expired/used links, existing customers, email failure + resend and
dashboard access before activation."""

import re
import smtplib
from datetime import timedelta
from unittest import mock

from django.core import mail
from django.test import override_settings
from django.urls import reverse
from django.utils import timezone
from rest_framework import status
from rest_framework.test import APITestCase
from rest_framework_simplejwt.tokens import RefreshToken

from accounts.models import CustomerOnboarding, EmailOTP, User
from common.test_utils import make_user, patch_pincode_directory
from orders.models import Order, Transaction
from website_content.models import OrderCardProduct

from .models import CheckoutSession, CheckoutVerification
from .tests import _guest_payload

PASSWORD = "MyPass@123"
ACTIVATION_SUBJECT = "Your VR's Gateway Customer Account Is Ready!"


def _activation_token(message):
    match = re.search(r"/set-password\?token=([\w.\-]+)", message.body)
    return match.group(1) if match else None


@override_settings(
    DUMMY_PAYMENTS_ENABLED=True,
    RAZORPAY_KEY_ID="",
    RAZORPAY_KEY_SECRET="",
    ONBOARDING_EMAIL_SYNC=True,
    BREVO_API_KEY="",
    EMAIL_BACKEND="django.core.mail.backends.locmem.EmailBackend",
    FRONTEND_URL="https://shop.example.com",
)
class DummyPaymentActivationTests(APITestCase):
    def setUp(self):
        patch_pincode_directory(self)
        for slug, name, price, card_type in [
            ("custom", "VR's Gateway Custom NFC Card", "999.00", "CUSTOM"),
            ("google-review", "Google Review Card", "499.00", "REVIEW"),
        ]:
            OrderCardProduct.objects.update_or_create(
                slug=slug,
                defaults={"name": name, "price": price, "card_type": card_type, "is_active": True, "is_published": True},
            )
        # TestCase never commits, so run on_commit callbacks (emails) inline.
        patcher = mock.patch("accounts.onboarding.transaction.on_commit", side_effect=lambda fn, *a, **k: fn())
        patcher.start()
        self.addCleanup(patcher.stop)
        self.admin = make_user(email="admin@example.com", role=User.Role.ADMIN, is_staff=True)

    # --- helpers ------------------------------------------------------
    def _email_token(self, email):
        self.client.post(reverse("checkout-otp-send"), {"channel": "EMAIL", "destination": email}, format="json")
        code = re.search(r"verification code is:\s+(\d{6})", mail.outbox[-1].body).group(1)
        verified = self.client.post(
            reverse("checkout-otp-verify"), {"channel": "EMAIL", "destination": email, "code": code}, format="json"
        )
        mail.outbox.clear()
        CheckoutVerification.objects.update(created_at=timezone.now() - timedelta(minutes=2))
        return verified.data["data"]["verification_token"]

    def _start(self, email="new.buyer@example.com", product_id="PRD-NEXORA-CUSTOM", qty=1, **extra):
        payload = dict(_guest_payload(email=email, product_id=product_id, qty=qty), provider="dummy", **extra)
        payload.setdefault("email_verification_token", self._email_token(email))
        return self.client.post(reverse("razorpay-checkout"), payload, format="json")

    def _confirm(self, checkout, amount=None):
        body = {"checkout_id": checkout["checkout_id"], "amount": checkout["amount"] if amount is None else amount}
        return self.client.post(reverse("dummy-payment-confirm"), body, format="json")

    def _buy(self, email="new.buyer@example.com", **kwargs):
        start = self._start(email=email, **kwargs)
        self.assertEqual(start.status_code, status.HTTP_201_CREATED, start.content)
        paid = self._confirm(start.data["data"])
        self.assertEqual(paid.status_code, status.HTTP_200_OK, paid.content)
        return start.data["data"], paid.data["data"]

    def _as_admin(self):
        self.client.force_authenticate(self.admin)

    def _set_status(self, order_id, new_status):
        self._as_admin()
        response = self.client.post(reverse("admin-order-status", args=[order_id]), {"status": new_status}, format="json")
        self.client.force_authenticate(None)
        return response

    def _activation_emails(self):
        return [m for m in mail.outbox if m.subject == ACTIVATION_SUBJECT]

    def _activate(self, token, password=PASSWORD, confirm=None):
        return self.client.post(
            reverse("auth-activation-complete"),
            {"token": token, "new_password": password, "confirm_password": confirm or password},
            format="json",
        )

    def _login(self, identifier, password=PASSWORD):
        return self.client.post(reverse("auth-login"), {"email": identifier, "password": password}, format="json")

    # --- 1-11: the whole workflow --------------------------------------
    def test_full_workflow_new_customer(self):
        checkout, paid = self._buy(qty=1)
        # Server-priced: 999, minus the 20% first-order discount.
        self.assertEqual(checkout["amount"], 79920)
        self.assertEqual(checkout["provider"], "DUMMY")
        self.assertEqual(checkout["lines"][0]["qty"], 1)
        self.assertIsNone(checkout["razorpay_order_id"])

        order = Order.objects.get(pk=paid["order_id"])
        self.assertEqual(paid["order_number"], order.order_number)
        self.assertTrue(order.order_number)
        self.assertEqual(order.status, Order.Status.PENDING)
        self.assertEqual(order.payment_method, Order.PaymentMethod.DUMMY)
        self.assertEqual(order.payment_status, Order.PaymentStatus.PAID)
        self.assertTrue(Transaction.objects.filter(order=order, method="DUMMY", status="PAID").exists())

        user = order.customer
        self.assertEqual(user.email, "new.buyer@example.com")
        self.assertTrue(user.must_change_password)
        self.assertFalse(user.has_usable_password())
        self.assertTrue(paid["account_created"])
        self.assertEqual(self._activation_emails(), [])  # nothing until Processing
        onboarding = CustomerOnboarding.objects.get(user=user)
        self.assertEqual(onboarding.account_status, CustomerOnboarding.AccountStatus.PENDING_PROCESSING)
        self.assertEqual(onboarding.source_order, order)

        # Admin Orders shows it with everything the admin needs.
        self._as_admin()
        row = self.client.get(reverse("admin-orders")).data["data"][0]
        self.client.force_authenticate(None)
        self.assertEqual(row["order_number"], order.order_number)
        self.assertEqual((row["customer_name"], row["customer_email"], row["customer_phone"]), ("New Buyer", "new.buyer@example.com", "9876543210"))
        self.assertEqual(row["items"][0]["qty"], 1)
        self.assertEqual(row["payment_method_display"], "Dummy / Test Payment")
        self.assertEqual(row["payment_status_display"], "Paid (Test)")
        self.assertEqual(row["status"], "PENDING")
        self.assertEqual(row["account"]["status_display"], "Pending Processing")
        self.assertEqual(row["delivery"]["locality"], "Moazzampura")
        self.assertEqual(row["delivery"]["district"], "Hyderabad")

        # Admin -> Processing sends exactly one activation email.
        processing = self._set_status(order.pk, "PROCESSING")
        self.assertEqual(processing.status_code, status.HTTP_200_OK, processing.content)
        self.assertEqual(processing.data["data"]["activation_result"], "sent")
        self.assertEqual(processing.data["data"]["account"]["status_display"], "Activation Email Sent")
        emails = self._activation_emails()
        self.assertEqual(len(emails), 1)
        body = emails[0].body
        username = user.profile.username
        self.assertIn("Hello New Buyer,", body)
        self.assertIn(f"Username: {username}", body)
        self.assertIn(f"Order Number: {order.order_number}", body)
        self.assertIn("https://shop.example.com/set-password?token=", body)
        self.assertNotRegex(body, r"(?im)^\s*(temporary\s+)?password\s*:")  # never a password
        token = _activation_token(emails[0])
        self.assertNotIn(token.split(".", 1)[1], EmailOTP.objects.get(purpose="ACTIVATE").code_hash)

        # Saving Processing again sends nothing.
        self.assertEqual(self._set_status(order.pk, "PROCESSING").status_code, status.HTTP_200_OK)
        self.assertEqual(len(self._activation_emails()), 1)

        # Dashboard access before activation is refused.
        access = str(RefreshToken.for_user(user).access_token)
        self.assertEqual(self.client.get(reverse("auth-me"), HTTP_AUTHORIZATION=f"Bearer {access}").status_code, 401)

        # Set password through the link.
        check = self.client.post(reverse("auth-activation-check"), {"token": token}, format="json")
        self.assertEqual(check.data["data"]["username"], username)
        self.assertIn("confirm_password", self._activate(token, confirm="Other@Pass1").data["errors"])
        self.assertEqual(self._activate(token, password="weak").status_code, status.HTTP_400_BAD_REQUEST)
        done = self._activate(token)
        self.assertEqual(done.status_code, status.HTTP_200_OK, done.content)
        user.refresh_from_db()
        self.assertFalse(user.must_change_password)
        self.assertTrue(user.check_password(PASSWORD))
        self.assertTrue(user.check_password(PASSWORD))
        self.assertEqual(CustomerOnboarding.objects.get(user=user).account_status, CustomerOnboarding.AccountStatus.ACTIVATED)

        # Single use.
        reused = self._activate(token)
        self.assertEqual(reused.data["errors"]["code"], "used")

        # Log in with the username or the email, then reach the dashboard API.
        for identifier in (username, "New.Buyer@example.com"):
            login = self._login(identifier)
            self.assertEqual(login.status_code, status.HTTP_200_OK, login.content)
        me = self.client.get(reverse("auth-me"), HTTP_AUTHORIZATION=f"Bearer {login.data['data']['access']}")
        self.assertEqual(me.status_code, status.HTTP_200_OK)
        orders = self.client.get(reverse("my-orders"), HTTP_AUTHORIZATION=f"Bearer {login.data['data']['access']}")
        self.assertEqual(orders.data["data"][0]["order_number"], order.order_number)

    def test_bulk_recipients_activate_and_resend_individually_after_one_failure(self):
        recipients = [
            {"full_name": "Recipient One", "email": "recipient.one@example.com", "phone": "+44 7700 900123"},
            {"full_name": "Recipient Two", "email": "recipient.two@example.com", "phone": "+44 7700 900123"},
            {"full_name": "Recipient Three", "email": "recipient.three@example.com", "phone": "+44 7700 900123"},
        ]
        _, paid = self._buy(qty=3, recipients=recipients)
        order = Order.objects.get(pk=paid["order_id"])
        self.assertEqual(order.recipients.count(), 3)
        self.assertEqual(self._activation_emails(), [])

        from accounts import onboarding

        original_send = onboarding._send

        def send_to_each(user, subject, html, text):
            if user.email == recipients[0]["email"]:
                raise smtplib.SMTPException("recipient mailbox unavailable")
            return original_send(user, subject, html, text)

        with mock.patch("accounts.onboarding._send", side_effect=send_to_each):
            processing = self._set_status(order.pk, "PROCESSING")

        self.assertEqual(processing.status_code, status.HTTP_200_OK, processing.content)
        self.assertEqual(processing.data["data"]["activation_result"], "sent")
        self.assertEqual(
            {(recipient["name"], recipient["email"]) for recipient in processing.data["data"]["recipients"]},
            {(recipient["full_name"], recipient["email"]) for recipient in recipients},
        )
        self.assertEqual(
            {recipient["email"]: recipient["invitation_status"] for recipient in processing.data["data"]["recipients"]},
            {
                recipients[0]["email"]: "FAILED",
                recipients[1]["email"]: "SENT",
                recipients[2]["email"]: "SENT",
            },
        )
        self.assertEqual(
            {email for message in self._activation_emails() for email in message.to},
            {recipients[1]["email"], recipients[2]["email"], order.customer.email},
        )
        failed_recipient = order.recipients.get(email=recipients[0]["email"])
        onboarding_record = CustomerOnboarding.objects.get(user=failed_recipient.user)
        self.assertEqual(onboarding_record.email_status, CustomerOnboarding.EmailStatus.FAILED)

        self._as_admin()
        resend = self.client.post(reverse("admin-onboarding-resend", args=[onboarding_record.pk]))
        self.client.force_authenticate(None)
        self.assertEqual(resend.status_code, status.HTTP_200_OK, resend.content)
        self.assertEqual(self._activation_emails()[-1].to, [recipients[0]["email"]])

        self.assertEqual(self._set_status(order.pk, "PROCESSING").status_code, status.HTTP_200_OK)
        self.assertEqual(len(self._activation_emails()), 4)

    def test_bulk_checkout_requires_recipient_details(self):
        response = self._start(qty=3, recipients=[])
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("recipients", response.data["errors"])

        from payments.services import CheckoutError, validate_recipients

        for recipients in (None, []):
            with self.subTest(recipients=recipients), self.assertRaises(CheckoutError):
                validate_recipients(recipients, 3)

        with self.assertRaises(CheckoutError):
            validate_recipients(
                [
                    {"full_name": "One", "email": "one@example.com"},
                    {"full_name": "Two", "email": "two@example.com"},
                ],
                3,
            )

    # --- checkout validation, duplicates, amount -------------------------
    def test_repeated_confirmation_returns_the_same_order(self):
        checkout, first = self._buy()
        again = self._confirm(checkout)
        self.assertEqual(again.status_code, status.HTTP_200_OK)
        self.assertEqual(again.data["data"]["order_id"], first["order_id"])
        self.assertEqual(Order.objects.count(), 1)
        self.assertEqual(User.objects.filter(email="new.buyer@example.com").count(), 1)

    def test_tampered_amount_is_rejected(self):
        checkout = self._start().data["data"]
        response = self._confirm(checkout, amount=100)
        self.assertEqual(response.status_code, status.HTTP_409_CONFLICT)
        self.assertEqual(response.data["errors"]["code"], "amount_mismatch")
        self.assertFalse(Order.objects.exists())

    def test_client_prices_are_ignored(self):
        payload = dict(_guest_payload(), provider="dummy", email_verification_token=self._email_token("new.buyer@example.com"))
        payload["items"] = [{"product_id": "PRD-NEXORA-CUSTOM", "qty": 1, "price": "1.00"}]
        response = self.client.post(reverse("razorpay-checkout"), payload, format="json")
        self.assertEqual(response.data["data"]["amount"], 79920)

    def test_invalid_checkout_details_are_rejected(self):
        unverified = dict(_guest_payload(), provider="dummy", email_verification_token="forged")
        self.assertEqual(self.client.post(reverse("razorpay-checkout"), unverified, format="json").status_code, 400)
        bad = self._start(contact={"full_name": "", "email": "new.buyer@example.com", "phone": "123"})
        self.assertEqual(bad.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("phone", bad.data["errors"]["contact"])
        self.assertEqual(self.client.post(reverse("dummy-payment-confirm"), {"checkout_id": "nope"}, format="json").status_code, 404)
        self.assertFalse(CheckoutSession.objects.exists())

    @override_settings(DUMMY_PAYMENTS_ENABLED=False)
    def test_dummy_payments_are_off_unless_enabled(self):
        self.assertFalse(self.client.get(reverse("razorpay-config")).data["data"]["dummy_enabled"])
        response = self._start()
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)
        self.assertEqual(response.data["errors"]["code"], "dummy_payments_disabled")

    def test_confirm_refused_once_dummy_payments_are_switched_off(self):
        checkout = self._start().data["data"]
        with override_settings(DUMMY_PAYMENTS_ENABLED=False):
            self.assertEqual(self._confirm(checkout).status_code, status.HTTP_403_FORBIDDEN)
        self.assertFalse(Order.objects.exists())

    # --- admin rules -----------------------------------------------------
    def test_unpaid_order_cannot_move_to_processing(self):
        customer = make_user(email="offline@example.com")
        order = Order.objects.create(
            customer=customer, amount="999.00", payment_method="COD", payment_status="PENDING",
            shipping_line1="1 Street", shipping_city="Hyderabad", shipping_state="Telangana", shipping_pincode="500001",
        )
        response = self._set_status(order.pk, "PROCESSING")
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(response.data["errors"]["code"], "payment_required")
        order.refresh_from_db()
        self.assertEqual(order.status, Order.Status.PENDING)

    def test_only_admins_change_status_or_resend(self):
        _, paid = self._buy()
        self.client.force_authenticate(make_user(email="someone@example.com"))
        self.assertEqual(
            self.client.post(reverse("admin-order-status", args=[paid["order_id"]]), {"status": "PROCESSING"}, format="json").status_code,
            status.HTTP_403_FORBIDDEN,
        )
        onboarding = CustomerOnboarding.objects.get()
        self.assertEqual(self.client.post(reverse("admin-onboarding-resend", args=[onboarding.pk])).status_code, 403)
        self.assertEqual(self._activation_emails(), [])

    # --- links -------------------------------------------------------------
    def test_expired_link_is_refused(self):
        _, paid = self._buy()
        self._set_status(paid["order_id"], "PROCESSING")
        token = _activation_token(self._activation_emails()[0])
        EmailOTP.objects.filter(purpose="ACTIVATE").update(expires_at=timezone.now() - timedelta(minutes=1))
        response = self._activate(token)
        self.assertEqual(response.data["errors"]["code"], "expired")
        self.assertTrue(User.objects.get(email="new.buyer@example.com").must_change_password)
        self.assertEqual(self._activate("1.garbage").data["errors"]["code"], "invalid")

    def test_login_and_password_reset_cannot_bypass_activation(self):
        _, paid = self._buy()
        login = self._login("new.buyer@example.com", "Anything@1")
        self.assertEqual(login.status_code, status.HTTP_400_BAD_REQUEST)
        self.client.post(reverse("auth-forgot-password"), {"email": "new.buyer@example.com"}, format="json")
        self.assertFalse(EmailOTP.objects.filter(user__email="new.buyer@example.com", purpose="RESET").exists())

    # --- existing customers -------------------------------------------------
    def test_existing_customer_order_links_to_account_without_touching_password(self):
        existing = make_user(email="regular@example.com", password="Exist@123", full_name="Regular")
        old_hash = existing.password
        _, first = self._buy(email="Regular@Example.com")
        _, second = self._buy(email="regular@example.com", product_id="PRD-NEXORA-GOOGLE-REVIEW")
        self.assertEqual(User.objects.filter(email__iexact="regular@example.com").count(), 1)
        self.assertEqual(set(existing.orders.values_list("pk", flat=True)), {first["order_id"], second["order_id"]})
        self.assertFalse(first["account_created"])
        processing = self._set_status(first["order_id"], "PROCESSING")
        self.assertEqual(processing.data["data"]["activation_result"], "active")
        self.assertEqual(processing.data["data"]["account"]["status_display"], "Account Activated")
        existing.refresh_from_db()
        self.assertEqual(existing.password, old_hash)
        self.assertFalse(CustomerOnboarding.objects.filter(user=existing).exists())
        self.assertEqual(self._activation_emails(), [])

    def test_second_order_before_activation_does_not_send_a_second_email(self):
        _, first = self._buy()
        _, second = self._buy(product_id="PRD-NEXORA-GOOGLE-REVIEW")
        self.assertEqual(Order.objects.get(pk=second["order_id"]).customer, Order.objects.get(pk=first["order_id"]).customer)
        self.assertEqual(self._set_status(first["order_id"], "PROCESSING").data["data"]["activation_result"], "sent")
        self.assertEqual(self._set_status(second["order_id"], "PROCESSING").data["data"]["activation_result"], "already_sent")
        self.assertEqual(len(self._activation_emails()), 1)

    # --- email failure + resend ----------------------------------------------
    def test_email_failure_is_recorded_and_admin_can_resend(self):
        _, paid = self._buy()
        with mock.patch("accounts.onboarding._send", side_effect=smtplib.SMTPException("down")):
            processing = self._set_status(paid["order_id"], "PROCESSING")
        self.assertEqual(processing.status_code, status.HTTP_200_OK)
        order = Order.objects.get(pk=paid["order_id"])
        self.assertEqual(order.status, Order.Status.PROCESSING)  # order unaffected
        onboarding = CustomerOnboarding.objects.get()
        self.assertEqual(onboarding.email_status, CustomerOnboarding.EmailStatus.FAILED)
        self.assertEqual(onboarding.email_attempts, 3)
        self.assertEqual(onboarding.email_last_error, "SMTPException")
        self.assertEqual(onboarding.account_status, CustomerOnboarding.AccountStatus.EMAIL_FAILED)
        self.assertEqual(self._activation_emails(), [])

        self._as_admin()
        resend = self.client.post(reverse("admin-onboarding-resend", args=[onboarding.pk]))
        self.client.force_authenticate(None)
        self.assertEqual(resend.status_code, status.HTTP_200_OK, resend.content)
        emails = self._activation_emails()
        self.assertEqual(len(emails), 1)
        self.assertEqual(self._activate(_activation_token(emails[0])).status_code, status.HTTP_200_OK)

    def test_resend_replaces_the_old_link_and_is_refused_after_activation(self):
        _, paid = self._buy()
        self._set_status(paid["order_id"], "PROCESSING")
        old = _activation_token(self._activation_emails()[0])
        onboarding = CustomerOnboarding.objects.get()
        self._as_admin()
        self.client.post(reverse("admin-onboarding-resend", args=[onboarding.pk]))
        self.client.force_authenticate(None)
        new = _activation_token(self._activation_emails()[-1])
        self.assertNotEqual(old, new)
        self.assertEqual(self._activate(old).data["errors"]["code"], "used")
        self.assertEqual(self._activate(new).status_code, status.HTTP_200_OK)
        self._as_admin()
        self.assertEqual(self.client.post(reverse("admin-onboarding-resend", args=[onboarding.pk])).status_code, 400)

    def test_resend_before_processing_is_refused(self):
        self._buy()
        self._as_admin()
        response = self.client.post(reverse("admin-onboarding-resend", args=[CustomerOnboarding.objects.get().pk]))
        self.assertEqual(response.data["errors"]["code"], "not_processing")
        self.assertEqual(self._activation_emails(), [])


class RegistrationClosedTests(APITestCase):
    def test_public_registration_is_closed(self):
        response = self.client.post(
            reverse("auth-register"),
            {"full_name": "Someone", "email": "someone@example.com", "password": "Strong@123", "confirm_password": "Strong@123"},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)
        self.assertEqual(response.data["errors"]["code"], "registration_closed")
        self.assertFalse(User.objects.filter(email="someone@example.com").exists())

    def test_google_sign_in_cannot_create_accounts_but_existing_can_sign_in(self):
        claims = {"sub": "g-1", "email": "fresh@example.com", "email_verified": True, "name": "Fresh"}
        with mock.patch("accounts.views.verify_google_id_token", return_value=claims):
            fresh = self.client.post(reverse("auth-google"), {"credential": "x"}, format="json")
        self.assertEqual(fresh.status_code, status.HTTP_403_FORBIDDEN)
        self.assertFalse(User.objects.filter(email="fresh@example.com").exists())

        make_user(email="member@example.com")
        with mock.patch("accounts.views.verify_google_id_token", return_value={**claims, "email": "member@example.com"}):
            member = self.client.post(reverse("auth-google"), {"credential": "x"}, format="json")
        self.assertEqual(member.status_code, status.HTTP_200_OK, member.content)
