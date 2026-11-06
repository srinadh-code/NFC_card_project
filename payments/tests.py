import hashlib
import hmac
import json
import re
from datetime import timedelta
from unittest import mock

from django.core import mail
from django.test import override_settings
from django.urls import reverse
from django.utils import timezone
from rest_framework import status
from rest_framework.test import APITestCase
from rest_framework_simplejwt.tokens import RefreshToken

from accounts.models import CustomerOnboarding, User
from common.test_utils import make_user, patch_pincode_directory
from customer_management.customer_cart.models import Cart, CartItem
from orders.models import Order
from website_content.models import OrderCardProduct

from .models import CheckoutSession, CheckoutVerification

KEY_SECRET = "test_key_secret"
WEBHOOK_SECRET = "test_webhook_secret"
NEW_PASSWORD = "NewPass@123"


def _sign(order_id, payment_id):
    return hmac.new(KEY_SECRET.encode(), f"{order_id}|{payment_id}".encode(), hashlib.sha256).hexdigest()


def _guest_payload(email="new.buyer@example.com", product_id="PRD-NEXORA-CUSTOM", qty=1):
    return {
        "contact": {"full_name": "New Buyer", "email": email, "phone": "9876543210"},
        "address": {
            "phone": "9876543210",
            "address_line1": "Plot 12, Main Road",
            "locality": "Moazzampura",
            "city": "Hyderabad",
            "district": "Hyderabad",
            "state": "Telangana",
            "pincode": "500001",
        },
        "items": [{"product_id": product_id, "qty": qty}],
        "recipients": [{"full_name": "New Buyer", "email": email, "phone": "9876543210"} for _ in range(qty)],
    }


@override_settings(
    RAZORPAY_KEY_ID="rzp_test_key",
    RAZORPAY_KEY_SECRET=KEY_SECRET,
    RAZORPAY_WEBHOOK_SECRET=WEBHOOK_SECRET,
    ONBOARDING_EMAIL_SYNC=True,
    BREVO_API_KEY="",
    EMAIL_BACKEND="django.core.mail.backends.locmem.EmailBackend",
    DUMMY_PAYMENTS_ENABLED=False,
)
class RazorpayOnboardingTests(APITestCase):
    def setUp(self):
        patch_pincode_directory(self)
        # Seeded by website_content's data migrations — pin known prices.
        for slug, name, price, card_type in [
            ("custom", "GATEWAY Custom", "999.00", "CUSTOM"),
            ("google-review", "Google Review Card", "499.00", "REVIEW"),
        ]:
            OrderCardProduct.objects.update_or_create(
                slug=slug,
                defaults={"name": name, "price": price, "card_type": card_type, "is_active": True, "is_published": True},
            )
        self._order_seq = 0
        patcher = mock.patch("payments.razorpay.create_order", side_effect=self._fake_create_order)
        self.create_order = patcher.start()
        self.addCleanup(patcher.stop)
        # TestCase never commits its transaction, so on_commit callbacks (the
        # welcome email is sent only after the order commits) run inline here.
        commit_patcher = mock.patch("accounts.onboarding.transaction.on_commit", side_effect=lambda fn, *a, **k: fn())
        commit_patcher.start()
        self.addCleanup(commit_patcher.stop)

    def _fake_create_order(self, amount_paise, **kwargs):
        self._order_seq += 1
        return {"id": f"order_test{self._order_seq}", "amount": amount_paise}

    # --- helpers -----------------------------------------------------
    def _email_token(self, email):
        sent = self.client.post(reverse("checkout-otp-send"), {"channel": "EMAIL", "destination": email}, format="json")
        self.assertEqual(sent.status_code, status.HTTP_200_OK, sent.content)
        code = re.search(r"verification code is:\s+(\d{6})", mail.outbox[-1].body).group(1)
        verified = self.client.post(
            reverse("checkout-otp-verify"), {"channel": "EMAIL", "destination": email, "code": code}, format="json"
        )
        self.assertEqual(verified.status_code, status.HTTP_200_OK, verified.content)
        mail.outbox.clear()  # keep the order-email assertions about order emails only
        CheckoutVerification.objects.update(created_at=timezone.now() - timedelta(minutes=2))  # past the resend cooldown
        return verified.data["data"]["verification_token"]

    def _with_token(self, payload):
        payload = dict(payload)
        if "email_verification_token" not in payload:
            payload["email_verification_token"] = self._email_token(payload["contact"]["email"])
        return payload

    def _checkout(self, payload=None):
        payload = self._with_token(payload or _guest_payload())
        response = self.client.post(reverse("razorpay-checkout"), payload, format="json")
        self.assertEqual(response.status_code, status.HTTP_201_CREATED, response.content)
        return response.data["data"]

    def _verify(self, checkout, payment_id="pay_test1", signature=None):
        order_id = checkout["razorpay_order_id"]
        return self.client.post(
            reverse("razorpay-verify"),
            {
                "razorpay_order_id": order_id,
                "razorpay_payment_id": payment_id,
                "razorpay_signature": signature or _sign(order_id, payment_id),
            },
            format="json",
        )

    def _webhook(self, event, order_id, amount, payment_id="pay_test1", secret=WEBHOOK_SECRET):
        body = json.dumps(
            {"event": event, "payload": {"payment": {"entity": {"id": payment_id, "order_id": order_id, "amount": amount}}}}
        ).encode()
        signature = hmac.new(secret.encode(), body, hashlib.sha256).hexdigest()
        return self.client.post(
            reverse("razorpay-webhook"), data=body, content_type="application/json", HTTP_X_RAZORPAY_SIGNATURE=signature
        )

    def _login(self, email, password):
        return self.client.post(reverse("auth-login"), {"email": email, "password": password}, format="json")

    def _buy_as_new_customer(self, product_id="PRD-NEXORA-CUSTOM", email="new.buyer@example.com"):
        checkout = self._checkout(_guest_payload(email=email, product_id=product_id))
        response = self._verify(checkout)
        self.assertEqual(response.status_code, status.HTTP_200_OK, response.content)
        return checkout, response

    # --- Scenario C: existing customer --------------------------------
    def test_scenario_c_existing_customer(self):
        existing = make_user(email="regular@example.com", password="Exist@123")
        old_hash = existing.password
        checkout = self._checkout(_guest_payload(email="Regular@Example.com"))
        response = self._verify(checkout)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertFalse(response.data["data"]["account_created"])

        self.assertEqual(User.objects.filter(email__iexact="regular@example.com").count(), 1)
        existing.refresh_from_db()
        self.assertEqual(existing.password, old_hash)
        self.assertFalse(existing.must_change_password)
        self.assertFalse(CustomerOnboarding.objects.filter(user=existing).exists())
        self.assertEqual(Order.objects.get(pk=response.data["data"]["order_id"]).customer, existing)
        self.assertEqual(len(mail.outbox), 1)
        self.assertIn("is confirmed", mail.outbox[0].subject)
        self.assertNotIn("password", mail.outbox[0].body.lower())

    # --- Scenario F: security ---------------------------------------
    def test_scenario_f_temporary_account_cannot_use_customer_apis(self):
        self._buy_as_new_customer()
        user = User.objects.get(email="new.buyer@example.com")
        token = str(RefreshToken.for_user(user).access_token)
        for name in ["auth-me", "customer-addresses"]:
            response = self.client.get(reverse(name), HTTP_AUTHORIZATION=f"Bearer {token}")
            self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED, name)

    def test_scenario_f_duplicate_verify_and_webhook_are_idempotent(self):
        checkout, first = self._buy_as_new_customer()
        again = self._verify(checkout)
        self.assertEqual(again.status_code, status.HTTP_200_OK)
        self.assertEqual(again.data["data"]["order_id"], first.data["data"]["order_id"])
        for _ in range(2):
            self.assertEqual(
                self._webhook("payment.captured", checkout["razorpay_order_id"], checkout["amount"]).status_code,
                status.HTTP_200_OK,
            )
        self.assertEqual(User.objects.filter(email="new.buyer@example.com").count(), 1)
        self.assertEqual(Order.objects.count(), 1)
        self.assertEqual(CustomerOnboarding.objects.count(), 1)
        self.assertEqual(len(mail.outbox), 1)

    def test_scenario_f_webhook_alone_fulfils_once(self):
        checkout = self._checkout()
        self._webhook("payment.captured", checkout["razorpay_order_id"], checkout["amount"])
        self._webhook("order.paid", checkout["razorpay_order_id"], checkout["amount"])
        self.assertEqual(Order.objects.count(), 1)
        self.assertEqual(CheckoutSession.objects.get().fulfilled_via, "webhook")
        self.assertEqual(len(mail.outbox), 1)

    def test_scenario_f_forged_payments_create_nothing(self):
        checkout = self._checkout()
        bad = self._verify(checkout, signature="0" * 64)
        self.assertEqual(bad.status_code, status.HTTP_400_BAD_REQUEST)
        forged_hook = self._webhook("payment.captured", checkout["razorpay_order_id"], checkout["amount"], secret="wrong")
        self.assertEqual(forged_hook.status_code, status.HTTP_400_BAD_REQUEST)
        short_paid = self._webhook("payment.captured", checkout["razorpay_order_id"], 100)
        self.assertEqual(short_paid.status_code, status.HTTP_200_OK)
        self.assertEqual(Order.objects.count(), 0)
        self.assertFalse(User.objects.filter(email="new.buyer@example.com").exists())
        self.assertEqual(len(mail.outbox), 0)

    def test_scenario_f_failed_payment_creates_no_account(self):
        checkout = self._checkout()
        self._webhook("payment.failed", checkout["razorpay_order_id"], checkout["amount"])
        self.assertEqual(CheckoutSession.objects.get().status, CheckoutSession.Status.FAILED)
        self.assertFalse(User.objects.filter(email="new.buyer@example.com").exists())

    def test_client_cannot_set_prices(self):
        payload = _guest_payload()
        payload["items"] = [{"product_id": "PRD-NEXORA-CUSTOM", "qty": 1, "price": "1.00"}]
        checkout = self._checkout(payload)
        self.assertEqual(checkout["amount"], 79920)
        unknown = self._with_token(_guest_payload(product_id="PRD-NEXORA-FAKE"))
        response = self.client.post(reverse("razorpay-checkout"), unknown, format="json")
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_guest_address_is_verified_against_pin(self):
        payload = _guest_payload()
        payload["address"]["pincode"] = "122001"  # Haryana PIN for a Telangana address
        response = self.client.post(reverse("razorpay-checkout"), self._with_token(payload), format="json")
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(CheckoutSession.objects.count(), 0)

    def test_onboarding_admin_api_requires_admin(self):
        self.client.force_authenticate(make_user(email="cust@example.com"))
        self.assertEqual(self.client.get(reverse("admin-onboarding")).status_code, status.HTTP_403_FORBIDDEN)

    # --- signed-in customers & configuration -------------------------
    def test_signed_in_customer_pays_for_own_cart(self):
        customer = make_user(email="member@example.com")
        from customer_management.customer_addresses.models import CustomerAddress

        address = CustomerAddress.objects.create(
            customer=customer, full_name="Member", phone="9876543210", address_line1="Plot 1",
            locality="Moazzampura", city="Hyderabad", district="Hyderabad", state="Telangana", pincode="500001",
        )
        cart = Cart.objects.create(customer=customer)
        CartItem.objects.create(cart=cart, product_id="PRD-NEXORA-CUSTOM", name="GATEWAY Custom", card_type="CUSTOM", qty=2, price="1.00")
        token = str(RefreshToken.for_user(customer).access_token)
        response = self.client.post(
            reverse("razorpay-checkout"), {"address_id": address.pk, "recipients": [{"full_name": "Member", "email": customer.email, "phone": "9876543210"} for _ in range(2)]}, format="json", HTTP_AUTHORIZATION=f"Bearer {token}"
        )
        self.assertEqual(response.status_code, status.HTTP_201_CREATED, response.content)
        checkout = response.data["data"]
        self.assertEqual(checkout["amount"], 159840)  # 2 x 999 - 20% first order
        verified = self._verify(checkout)
        order = Order.objects.get(pk=verified.data["data"]["order_id"])
        self.assertEqual(order.customer, customer)
        self.assertFalse(verified.data["data"]["account_created"])
        self.assertFalse(cart.items.exists())
        self.assertEqual(User.objects.count(), 1)

    @override_settings(RAZORPAY_KEY_ID="", RAZORPAY_KEY_SECRET="")
    def test_payments_unavailable_without_keys(self):
        config = self.client.get(reverse("razorpay-config"))
        self.assertFalse(config.data["data"]["enabled"])
        response = self.client.post(reverse("razorpay-checkout"), _guest_payload(), format="json")
        self.assertEqual(response.status_code, status.HTTP_503_SERVICE_UNAVAILABLE)
        self.assertEqual(response.data["errors"]["code"], "payments_unavailable")

    def test_config_exposes_only_public_key(self):
        response = self.client.get(reverse("razorpay-config"))
        self.assertEqual(response.data["data"], {"enabled": True, "key_id": "rzp_test_key", "currency": "INR", "sms_otp_enabled": False, "dummy_enabled": False})
        self.assertNotIn(KEY_SECRET, response.content.decode())

    # --- checkout OTP verification ---------------------------------------
    def _send(self, channel="EMAIL", destination="new.buyer@example.com"):
        return self.client.post(reverse("checkout-otp-send"), {"channel": channel, "destination": destination}, format="json")

    def _verify_code(self, code, channel="EMAIL", destination="new.buyer@example.com"):
        return self.client.post(
            reverse("checkout-otp-verify"), {"channel": channel, "destination": destination, "code": code}, format="json"
        )

    def _last_code(self):
        return re.search(r"verification code is:\s+(\d{6})", mail.outbox[-1].body).group(1)

    def test_checkout_requires_verified_email(self):
        response = self.client.post(reverse("razorpay-checkout"), _guest_payload(), format="json")
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(response.data["errors"]["code"], "verification_required")
        forged = dict(_guest_payload(), email_verification_token="made-up")
        self.assertEqual(self.client.post(reverse("razorpay-checkout"), forged, format="json").status_code, 400)
        other = dict(_guest_payload(email="someone.else@example.com"), email_verification_token=self._email_token("new.buyer@example.com"))
        self.assertEqual(self.client.post(reverse("razorpay-checkout"), other, format="json").status_code, 400)
        self.assertEqual(CheckoutSession.objects.count(), 0)

    def test_email_otp_is_hashed_single_use_and_verifies(self):
        self.assertEqual(self._send().status_code, status.HTTP_200_OK)
        code = self._last_code()
        challenge = CheckoutVerification.objects.get()
        self.assertNotIn(code, challenge.code_hash)
        ok = self._verify_code(code)
        self.assertEqual(ok.status_code, status.HTTP_200_OK)
        self.assertTrue(ok.data["data"]["verification_token"])
        self.assertNotIn(ok.data["data"]["verification_token"], CheckoutVerification.objects.get().token_hash)
        again = self._verify_code(code)
        self.assertEqual(again.status_code, status.HTTP_400_BAD_REQUEST)

    def test_invalid_code_rejected_and_locks_after_max_attempts(self):
        self._send()
        code = self._last_code()
        wrong = "000000" if code != "000000" else "111111"
        for _ in range(4):
            self.assertEqual(self._verify_code(wrong).data["errors"]["code"], "incorrect")
        self.assertEqual(self._verify_code(wrong).data["errors"]["code"], "locked")
        self.assertEqual(self._verify_code(code).status_code, status.HTTP_400_BAD_REQUEST)

    def test_expired_code_rejected(self):
        self._send()
        code = self._last_code()
        CheckoutVerification.objects.update(expires_at=timezone.now() - timedelta(seconds=1))
        response = self._verify_code(code)
        self.assertEqual(response.data["errors"]["code"], "expired")

    def test_resend_cooldown_and_new_code_replaces_old(self):
        self._send()
        first = self._last_code()
        cooldown = self._send()
        self.assertEqual(cooldown.status_code, status.HTTP_429_TOO_MANY_REQUESTS)
        self.assertEqual(cooldown.data["errors"]["code"], "cooldown")
        CheckoutVerification.objects.update(created_at=timezone.now() - timedelta(minutes=2))
        self.assertEqual(self._send().status_code, status.HTTP_200_OK)
        second = self._last_code()
        if first != second:
            self.assertEqual(self._verify_code(first).status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(self._verify_code(second).status_code, status.HTTP_200_OK)

    def test_mobile_otp_unavailable_without_msg91(self):
        response = self._send("SMS", "9876543210")
        self.assertEqual(response.status_code, status.HTTP_503_SERVICE_UNAVAILABLE)
        self.assertEqual(response.data["errors"]["code"], "sms_unavailable")
        self.assertFalse(self.client.get(reverse("razorpay-config")).data["data"]["sms_otp_enabled"])

    @override_settings(MSG91_AUTH_KEY="test-msg91-key", MSG91_OTP_TEMPLATE_ID="tmpl-1")
    def test_mobile_otp_via_msg91_then_checkout_marks_phone_verified(self):
        with mock.patch("payments.sms.requests.post") as post:
            post.return_value = mock.Mock(status_code=200, json=lambda: {"type": "success"})
            self.assertEqual(self._send("SMS", "+91 98765 43210").status_code, status.HTTP_200_OK)
        params = post.call_args.kwargs["params"]
        self.assertEqual(params["mobile"], "919876543210")
        code = params["otp"]
        challenge = CheckoutVerification.objects.get(channel="SMS")
        self.assertNotIn(code, challenge.code_hash)
        phone_token = self._verify_code(code, "SMS", "9876543210").data["data"]["verification_token"]
        checkout = self._checkout(dict(_guest_payload(), phone_verification_token=phone_token))
        session = CheckoutSession.objects.get(public_id=checkout["checkout_id"])
        self.assertTrue(session.email_verified)
        self.assertTrue(session.phone_verified)
        self._verify(checkout)
        admin = make_user(email="admin@example.com", role=User.Role.ADMIN, is_staff=True)
        self.client.force_authenticate(admin)
        row = self.client.get(reverse("admin-onboarding")).data["data"][0]
        self.assertEqual(row["customer_phone"], "9876543210")
        self.assertTrue(row["email_verified_by_otp"])
        self.assertTrue(row["phone_verified_by_otp"])
        # A paid order waits for an admin to move it to Processing.
        self.assertEqual(row["order_status"], "PENDING")
        self.assertNotIn(code, json.dumps(row, default=str))

    @override_settings(MSG91_AUTH_KEY="test-msg91-key", MSG91_OTP_TEMPLATE_ID="tmpl-1")
    def test_phone_token_must_match_phone(self):
        with mock.patch("payments.sms.requests.post") as post:
            post.return_value = mock.Mock(status_code=200, json=lambda: {"type": "success"})
            self._send("SMS", "9123456780")
        token = self._verify_code(post.call_args.kwargs["params"]["otp"], "SMS", "9123456780").data["data"]["verification_token"]
        payload = self._with_token(dict(_guest_payload(), phone_verification_token=token))  # phone is 9876543210
        response = self.client.post(reverse("razorpay-checkout"), payload, format="json")
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("phone", response.data["errors"])

    def test_invalid_destination_rejected(self):
        self.assertEqual(self._send("EMAIL", "not-an-email").status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(self._send("FAX", "x").status_code, status.HTTP_400_BAD_REQUEST)

    def test_verification_is_bound_to_checkout_session(self):
        ref = "browser-checkout-1"
        self.client.post(reverse("checkout-otp-send"), {"channel": "EMAIL", "destination": "new.buyer@example.com", "session_ref": ref}, format="json")
        code = self._last_code()
        # The code only verifies within the same checkout session...
        other = self.client.post(
            reverse("checkout-otp-verify"),
            {"channel": "EMAIL", "destination": "new.buyer@example.com", "code": code, "session_ref": "another-tab"},
            format="json",
        )
        self.assertEqual(other.status_code, status.HTTP_400_BAD_REQUEST)
        ok = self.client.post(
            reverse("checkout-otp-verify"),
            {"channel": "EMAIL", "destination": "new.buyer@example.com", "code": code, "session_ref": ref},
            format="json",
        )
        token = ok.data["data"]["verification_token"]
        mail.outbox.clear()
        # ...and its token only opens a checkout from that same session.
        stolen = dict(_guest_payload(), email_verification_token=token, session_ref="another-tab")
        self.assertEqual(self.client.post(reverse("razorpay-checkout"), stolen, format="json").status_code, 400)
        mine = dict(_guest_payload(), email_verification_token=token, session_ref=ref)
        self.assertEqual(self.client.post(reverse("razorpay-checkout"), mine, format="json").status_code, 201)

    # --- email delivery for checkout OTP ----------------------------------
    @override_settings(BREVO_API_KEY="revoked-key")
    def test_brevo_rejection_without_smtp_fails_cleanly(self):
        with mock.patch("accounts.emails.requests.post") as post:
            post.return_value = mock.Mock(status_code=401, json=lambda: {"code": "unauthorized", "message": "Key not found"})
            response = self._send()
        self.assertEqual(response.status_code, status.HTTP_502_BAD_GATEWAY)
        self.assertEqual(response.data["errors"]["code"], "delivery_failed")
        self.assertEqual(CheckoutVerification.objects.count(), 0)  # nothing to verify against
        self.assertEqual(len(mail.outbox), 0)

    @override_settings(BREVO_API_KEY="revoked-key", EMAIL_HOST="smtp.example.test")
    def test_brevo_rejection_falls_back_to_smtp(self):
        with mock.patch("accounts.emails.requests.post") as post:
            post.return_value = mock.Mock(status_code=401, json=lambda: {"code": "unauthorized", "message": "Key not found"})
            response = self._send()
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(mail.outbox[-1].subject, "Your VRS GATEWAY Verification Code")
        self.assertIn("This OTP is valid for 5 minutes.", mail.outbox[-1].body)
        self.assertNotIn(self._last_code(), response.content.decode())

    @override_settings(EMAIL_BACKEND="django.core.mail.backends.console.EmailBackend")
    def test_console_only_email_is_not_reported_as_sent(self):
        response = self._send()
        self.assertEqual(response.status_code, status.HTTP_503_SERVICE_UNAVAILABLE)
        self.assertEqual(response.data["errors"]["code"], "email_unavailable")
        self.assertEqual(CheckoutVerification.objects.count(), 0)
