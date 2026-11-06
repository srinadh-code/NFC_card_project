"""Purchaser/recipient boundaries through the real verified payment APIs."""
import re
from unittest import mock

from django.core import mail
from django.core.cache import cache
from django.test import override_settings
from django.urls import reverse
from rest_framework.test import APITestCase

from accounts.models import CustomerOnboarding, EmailOTP, User
from accounts.onboarding import ACTIVATION_SUBJECT
from common.test_utils import make_user
from nfc_cards.models import NfcCard
from orders.models import Order, OrderRecipient, Transaction
from payments.models import CheckoutSession
from payments.services import CheckoutError, validate_recipients
from payments import tests as payment_test_helpers
from payments.tests import KEY_SECRET, WEBHOOK_SECRET, _guest_payload
from profiles.models import Profile


def recipient(index=1, email=None):
    return {"full_name": f"Recipient {index}", "email": email or f"recipient{index}@example.com", "phone": "+44 7700 900123"}


@override_settings(
    RAZORPAY_KEY_ID="rzp_test_key", RAZORPAY_KEY_SECRET=KEY_SECRET,
    RAZORPAY_WEBHOOK_SECRET=WEBHOOK_SECRET, DUMMY_PAYMENTS_ENABLED=True,
    ONBOARDING_EMAIL_SYNC=True, BREVO_API_KEY="",
    EMAIL_BACKEND="django.core.mail.backends.locmem.EmailBackend",
    PASSWORD_HASHERS=["django.contrib.auth.hashers.MD5PasswordHasher"],
)
class MultiRecipientPaymentTests(APITestCase):
    _fake_create_order = payment_test_helpers.RazorpayOnboardingTests._fake_create_order
    _email_token = payment_test_helpers.RazorpayOnboardingTests._email_token
    _with_token = payment_test_helpers.RazorpayOnboardingTests._with_token
    _checkout = payment_test_helpers.RazorpayOnboardingTests._checkout
    _verify = payment_test_helpers.RazorpayOnboardingTests._verify
    _webhook = payment_test_helpers.RazorpayOnboardingTests._webhook

    def setUp(self):
        payment_test_helpers.RazorpayOnboardingTests.setUp(self)
        self.admin = make_user(email="admin@example.com", role=User.Role.ADMIN, is_staff=True)

    def buy(self, recipients, email="rahul@example.com"):
        payload = _guest_payload(email=email, qty=len(recipients))
        payload["recipients"] = recipients
        payload["address"]["phone"] = "9000000099"
        checkout = self._checkout(payload)
        response = self._verify(checkout, payment_id=f"pay_{self._order_seq}")
        self.assertEqual(response.status_code, 200, response.content)
        return checkout, Order.objects.get(pk=response.data["data"]["order_id"])

    def as_admin_get(self, name, *args):
        self.client.force_authenticate(self.admin)
        response = self.client.get(reverse(name, args=args))
        self.client.force_authenticate(None)
        self.assertEqual(response.status_code, 200, response.content)
        return response.data["data"]

    def test_all_required_quantities_keep_exact_allocations_without_fake_inventory(self):
        for quantity in (1, 2, 3, 5, 10):
            with self.subTest(quantity=quantity):
                _, order = self.buy([recipient(i, f"q{quantity}.r{i}@example.com") for i in range(quantity)], email=f"buyer{quantity}@example.com")
                self.assertEqual(order.recipients.count(), quantity)
                self.assertEqual(sum(item.qty for item in order.items.all()), quantity)
                self.assertFalse(Profile.objects.filter(user=order.customer).exists())
                self.assertFalse(order.recipients.filter(user=order.customer).exists())
                self.assertTrue(all(r.user_id and r.profile_id and r.phone == "+447700900123" for r in order.recipients.all()))
                self.assertEqual(order.delivery_phone, "9000000099")
                self.assertEqual(order.customer.addresses.get().phone, "9000000099")
                self.assertEqual(order.purchaser_email, order.customer.email)
                self.assertEqual(order.transactions.filter(status="PAID").count(), 1)
        self.assertEqual(NfcCard.objects.count(), 0)

    def test_activation_uses_recipient_accounts_for_every_supported_quantity(self):
        for quantity in range(1, 11):
            with self.subTest(quantity=quantity):
                cache.clear()  # Each quantity is independent of earlier cases' OTP throttles.
                emails = [f"q{quantity}.recipient{index}@example.com" for index in range(quantity)]
                _, order = self.buy([recipient(index, email) for index, email in enumerate(emails)], email=f"buyer{quantity}@example.com")
                self.client.force_authenticate(self.admin)
                response = self.client.post(reverse("admin-order-status", args=[order.pk]), {"status": "PROCESSING"}, format="json")
                self.client.force_authenticate(None)
                self.assertEqual(response.status_code, 200, response.content)
                messages = [message for message in mail.outbox if message.subject == ACTIVATION_SUBJECT]
                self.assertCountEqual([message.to[0] for message in messages], emails)
                self.assertEqual(order.recipients.count(), quantity)
                purchaser_record = CustomerOnboarding.objects.get(user=order.customer)
                self.assertIsNone(purchaser_record.credentials_issued_at)
                self.assertEqual(purchaser_record.email_attempts, 0)

    def test_single_card_for_other_person_separates_admin_directories(self):
        _, order = self.buy([recipient(email="priya@example.com")])
        purchasers = self.as_admin_get("admin-purchasers")
        self.assertEqual([(p["email"], p["total_cards_purchased"]) for p in purchasers], [("rahul@example.com", 1)])
        customers = self.as_admin_get("admin-customers")
        self.assertEqual([c["email"] for c in customers], ["priya@example.com"])
        detail = self.as_admin_get("admin-purchaser-detail", order.customer_id)
        self.assertEqual(detail["orders"][0]["recipients"][0]["phone"], "+447700900123")
        self.assertEqual(mail.outbox[-1].to, ["rahul@example.com"])

    def test_purchaser_is_also_recipient_uses_one_account_and_profile(self):
        _, order = self.buy([recipient(email=" Rahul@Example.COM "), recipient(2), recipient(3)])
        self.assertEqual(User.objects.filter(email__iexact="rahul@example.com").count(), 1)
        self.assertEqual(order.recipients.filter(user=order.customer).count(), 1)
        self.assertEqual(Profile.objects.filter(user=order.customer).count(), 1)
        customers = self.as_admin_get("admin-customers")
        self.assertEqual(len(customers), 3)
        self.assertIn("rahul@example.com", [c["email"] for c in customers])

    def test_repeated_email_retains_slots_and_reuses_existing_password_and_profile(self):
        person = make_user(email="priya@example.com", full_name="Original name", phone="9000000002")
        profile = Profile.ensure_for_user(person)
        password = person.password
        _, order = self.buy([recipient(email=" PRIYA@example.com "), recipient(2, "priya@example.com")])
        self.assertEqual(order.recipients.count(), 2)
        self.assertEqual(set(order.recipients.values_list("user_id", flat=True)), {person.pk})
        self.assertEqual(set(order.recipients.values_list("profile_id", flat=True)), {profile.pk})
        person.refresh_from_db()
        self.assertEqual((person.password, person.full_name, person.phone), (password, "Original name", "9000000002"))
        self.assertEqual(Profile.objects.filter(user=person).count(), 1)

    def test_repeat_purchases_and_different_purchaser_reuse_recipient(self):
        _, first = self.buy([recipient(), recipient(2)])
        _, second = self.buy([recipient(), recipient(2), recipient(3)])
        self.buy([recipient()], email="another.purchaser@example.com")
        self.assertEqual(first.customer_id, second.customer_id)
        self.assertEqual(User.objects.filter(email="recipient1@example.com").count(), 1)
        self.assertEqual(Profile.objects.filter(user__email="recipient1@example.com").count(), 1)
        detail = self.as_admin_get("admin-purchaser-detail", first.customer_id)
        self.assertEqual((detail["paid_order_count"], detail["total_cards_purchased"]), (2, 5))
        self.assertEqual(sorted(len(o["recipients"]) for o in detail["orders"]), [2, 3])
        self.assertEqual(detail["total_amount_paid"], str(first.total + second.total))

    def test_duplicate_verify_and_webhook_keep_accounts_allocations_ledger_and_email_once(self):
        checkout, order = self.buy([recipient(), recipient(2)])
        self.assertFalse(EmailOTP.objects.filter(purpose=EmailOTP.Purpose.ACTIVATE).exists())
        self.client.force_authenticate(self.admin)
        response = self.client.post(reverse("admin-order-status", args=[order.pk]), {"status": "PROCESSING"}, format="json")
        self.client.force_authenticate(None)
        self.assertEqual(response.status_code, 200, response.content)
        messages = [message for message in mail.outbox if message.subject == ACTIVATION_SUBJECT]
        self.assertCountEqual([message.to[0] for message in messages], ["recipient1@example.com", "recipient2@example.com"])
        account_count, profile_count, email_count = User.objects.count(), Profile.objects.count(), len(mail.outbox)
        for _ in range(2):
            self.assertEqual(self._verify(checkout, payment_id="pay_1").status_code, 200)
            self.assertEqual(self._webhook("payment.captured", checkout["razorpay_order_id"], checkout["amount"], payment_id="pay_1").status_code, 200)
        self.assertEqual((Order.objects.count(), OrderRecipient.objects.count(), Transaction.objects.count()), (1, 2, 1))
        self.assertEqual((User.objects.count(), Profile.objects.count(), len(mail.outbox)), (account_count, profile_count, email_count))
        self.assertEqual(order.customer.orders.count(), 1)
        self.assertEqual(EmailOTP.objects.filter(purpose=EmailOTP.Purpose.ACTIVATE).count(), 2)

    def test_failure_and_cancelled_checkout_provision_no_recipients_or_purchasers(self):
        payload = _guest_payload(qty=2)
        payload["recipients"] = [recipient(), recipient(2)]
        checkout = self._checkout(payload)
        self.assertEqual(Order.objects.count(), 0)  # closing/cancelling the payment dialog
        self._webhook("payment.failed", checkout["razorpay_order_id"], checkout["amount"])
        self.assertEqual(CheckoutSession.objects.get().status, "FAILED")
        self.assertEqual((OrderRecipient.objects.count(), Profile.objects.count()), (0, 0))
        self.assertEqual(self.as_admin_get("admin-purchasers"), [])

    def test_recipient_validation_checks_count_required_contacts_and_international_phone(self):
        for quantity in range(1, 11):
            self.assertEqual(len(validate_recipients([recipient(i) for i in range(quantity)], quantity)), quantity)
        for raw, quantity in ((None, 1), ([], 1), ([recipient()], 2), ([recipient()], 0), ([recipient()], 11)):
            with self.subTest(raw=raw, quantity=quantity), self.assertRaises(CheckoutError):
                validate_recipients(raw, quantity)
        for field, bad in (("full_name", " "), ("full_name", "12345"), ("full_name", "---..."), ("full_name", "Name\x7f"), ("email", "invalid"), ("phone", ""), ("phone", 9000000002), ("phone", "123")):
            with self.subTest(field=field, bad=bad), self.assertRaises(CheckoutError):
                validate_recipients([{**recipient(), field: bad}], 1)

    def test_checkout_rejects_fractional_bool_out_of_range_and_combined_quantity(self):
        for index, quantity in enumerate((0, -1, 11, 1.5, True, "1.5")):
            cache.clear()
            payload = _guest_payload(email=f"invalid{index}@example.com")
            payload["items"][0]["qty"] = quantity
            with self.subTest(quantity=quantity):
                response = self.client.post(reverse("razorpay-checkout"), self._with_token(payload), format="json")
                self.assertEqual(response.status_code, 400, response.content)
        payload = _guest_payload()
        cache.clear()
        payload["items"] = [{"product_id": "PRD-NEXORA-CUSTOM", "qty": 6}, {"product_id": "PRD-NEXORA-GOOGLE-REVIEW", "qty": 5}]
        response = self.client.post(reverse("razorpay-checkout"), self._with_token(payload), format="json")
        self.assertEqual(response.status_code, 400, response.content)
        self.assertEqual(CheckoutSession.objects.count(), 0)

    def test_unverified_purchaser_cannot_pay_for_valid_recipient(self):
        payload = _guest_payload()
        payload["recipients"] = [recipient()]
        response = self.client.post(reverse("razorpay-checkout"), payload, format="json")
        self.assertEqual(response.status_code, 400)
        self.assertEqual((Order.objects.count(), OrderRecipient.objects.count()), (0, 0))

    def test_privileged_accounts_are_rejected_before_payment_creation(self):
        payload = _guest_payload()
        payload["recipients"] = [recipient(email=self.admin.email)]
        response = self.client.post(reverse("razorpay-checkout"), self._with_token(payload), format="json")
        self.assertEqual(response.status_code, 400, response.content)
        payload = _guest_payload(email=self.admin.email)
        payload["recipients"] = [recipient()]
        response = self.client.post(reverse("razorpay-checkout"), self._with_token(payload), format="json")
        self.assertEqual(response.status_code, 400, response.content)
        self.create_order.assert_not_called()
        self.assertFalse(Profile.objects.filter(user=self.admin).exists())
        self.assertEqual(Order.objects.count(), 0)

    def test_confirmation_delivery_failure_does_not_corrupt_payment(self):
        payload = _guest_payload()
        payload["recipients"] = [recipient()]
        checkout = self._checkout(payload)
        with mock.patch("accounts.onboarding.send_email", return_value=False):
            paid = self._verify(checkout)
        self.assertEqual(paid.status_code, 200, paid.content)
        order = Order.objects.get()
        self.assertEqual((order.payment_status, order.recipients.count(), order.transactions.count()), ("PAID", 1, 1))
        self.assertEqual(CheckoutSession.objects.get().status, "FULFILLED")
        self.assertEqual(self._verify(checkout).status_code, 200)
        self.assertEqual(Order.objects.count(), 1)

    def test_authenticated_purchaser_contact_is_separate_from_delivery_and_cannot_replace_identity(self):
        from customer_management.customer_addresses.models import CustomerAddress
        from customer_management.customer_cart.models import Cart, CartItem

        buyer = make_user(email="member@example.com", full_name="", phone="")
        address = CustomerAddress.objects.create(customer=buyer, full_name="Delivery Person", phone="9000000099", address_line1="Plot 1", locality="Moazzampura", city="Hyderabad", district="Hyderabad", state="Telangana", pincode="500001")
        cart = Cart.objects.create(customer=buyer)
        def add_card():
            CartItem.objects.create(cart=cart, product_id="PRD-NEXORA-CUSTOM", name="Custom", card_type="CUSTOM", qty=1, price="999.00")
        add_card()
        contact = {"full_name": "Purchaser Name", "phone": "+44 7700 900111", "email": "attacker@example.com"}
        self.client.force_authenticate(buyer)
        response = self.client.post(reverse("razorpay-checkout"), {"address_id": address.pk, "recipients": [recipient()], "purchaser_contact": contact}, format="json")
        self.assertEqual(response.status_code, 201, response.content)
        checkout = response.data["data"]
        session = CheckoutSession.objects.get()
        self.assertEqual((session.email, session.full_name, session.phone, session.delivery_phone), (buyer.email, "Purchaser Name", "+447700900111", address.phone))
        self.client.force_authenticate(None)
        paid = self._verify(checkout)
        self.assertEqual(paid.status_code, 200, paid.content)
        order = Order.objects.get(pk=paid.data["data"]["order_id"])
        self.assertEqual((order.customer_id, order.purchaser_email, order.purchaser_phone, order.delivery_phone), (buyer.pk, buyer.email, "+447700900111", address.phone))
        buyer.refresh_from_db()
        self.assertEqual((buyer.full_name, buyer.phone), ("", ""))
        summary = self.as_admin_get("admin-purchaser-detail", buyer.pk)
        self.assertEqual((summary["name"], summary["phone"]), ("Purchaser Name", "+447700900111"))
        self.client.force_authenticate(self.admin)
        matched = self.client.get(reverse("admin-purchasers"), {"search": "Purchaser Name"})
        self.assertEqual([row["id"] for row in matched.data["data"]], [buyer.pk])
        self.client.force_authenticate(None)
        add_card()
        self.client.force_authenticate(buyer)
        cod = self.client.post(reverse("my-orders"), {"payment_method": "COD", "address_id": address.pk, "recipients": [recipient()], "purchaser_contact": contact}, format="json")
        self.assertEqual(cod.status_code, 201, cod.content)
        cod_order = Order.objects.get(pk=cod.data["data"]["id"])
        self.assertEqual((cod_order.purchaser_name, cod_order.purchaser_phone, cod_order.delivery_phone, cod_order.payment_status), ("Purchaser Name", "+447700900111", address.phone, "PENDING"))
        add_card()
        invalid = self.client.post(reverse("razorpay-checkout"), {"address_id": address.pk, "recipients": [recipient()], "purchaser_contact": {"full_name": "", "phone": "123"}}, format="json")
        self.assertEqual(invalid.status_code, 400)
        self.assertIn("purchaser_contact", invalid.data["errors"])
        self.client.force_authenticate(None)

    def test_assignment_requires_recipient_slot_available_card_and_verified_payment(self):
        _, order = self.buy([recipient(), recipient(2)])
        slots = list(order.recipients.all())
        cards = [NfcCard.objects.create(uid=f"uid{i}", serial_number=f"SERIAL{i}") for i in range(2)]
        self.client.force_authenticate(self.admin)
        url = reverse("admin-order-assign-card", args=[order.pk])
        missing = self.client.post(url, {"card_id": cards[0].pk}, format="json")
        self.assertEqual(missing.status_code, 400)
        body = {"card_id": cards[0].pk, "recipient_id": slots[0].pk}
        self.assertEqual(self.client.post(url, body, format="json").status_code, 200)
        self.assertEqual(self.client.post(url, body, format="json").status_code, 200)
        collision = self.client.post(url, {"card_id": cards[0].pk, "recipient_id": slots[1].pk}, format="json")
        self.assertEqual(collision.status_code, 400)
        second = self.client.post(url, {"card_id": cards[1].pk, "recipient_id": slots[1].pk}, format="json")
        self.assertEqual(second.status_code, 200, second.content)
        for slot, card in zip(slots, cards):
            slot.refresh_from_db()
            card.refresh_from_db()
            self.assertEqual((slot.assigned_card_id, card.user_id), (card.pk, slot.user_id))
        self.client.force_authenticate(None)
        detail = self.as_admin_get("admin-purchaser-detail", order.customer_id)
        self.assertEqual((detail["total_cards_purchased"], detail["total_cards_assigned"], detail["total_cards_activated"]), (2, 2, 0))

    def test_processing_setup_deduplicates_recipient_identity_and_preserves_buyer_only_role(self):
        _, order = self.buy([recipient(), recipient(2, "recipient1@example.com")])
        self.client.force_authenticate(self.admin)
        url = reverse("admin-order-status", args=[order.pk])
        self.assertEqual(self.client.post(url, {"status": "PROCESSING"}, format="json").status_code, 200)
        setup = [message for message in mail.outbox if "Account Is Ready" in message.subject]
        self.assertEqual([message.to[0] for message in setup], ["recipient1@example.com"])
        self.assertEqual(self.client.post(url, {"status": "PROCESSING"}, format="json").status_code, 200)
        self.assertEqual(len([m for m in mail.outbox if "Account Is Ready" in m.subject]), 1)
        self.client.force_authenticate(None)
        token = re.search(r"/set-password\?token=([\w.\-]+)", setup[0].body).group(1)
        password = "SafePass@123"
        activated = self.client.post(reverse("auth-activation-complete"), {"token": token, "new_password": password, "confirm_password": password}, format="json")
        self.assertEqual(activated.status_code, 200, activated.content)
        self.assertFalse(Profile.objects.filter(user=order.customer).exists())
        self.assertFalse(EmailOTP.objects.filter(user=order.customer, purpose=EmailOTP.Purpose.ACTIVATE).exists())
        login = self.client.post(reverse("auth-login"), {"email": "recipient1@example.com", "password": password}, format="json")
        self.assertEqual(login.status_code, 200, login.content)


@override_settings(PASSWORD_HASHERS=["django.contrib.auth.hashers.MD5PasswordHasher"])
class CartQuantityContractTests(APITestCase):
    def setUp(self):
        self.user = make_user()
        self.client.force_authenticate(self.user)

    def payload(self, qty=1, color="Black"):
        return {"product_id": "PRD-NEXORA-CUSTOM", "name": "Custom", "card_type": "CUSTOM", "color_name": color, "qty": qty}

    def test_cart_bounds_and_aggregate_updates(self):
        for quantity in (0, -1, 11, True, 1.5, "1.0"):
            with self.subTest(quantity=quantity):
                response = self.client.post(reverse("customer-cart-items"), self.payload(quantity), format="json")
                self.assertEqual(response.status_code, 400, response.content)
        first = self.client.post(reverse("customer-cart-items"), self.payload(6), format="json")
        self.assertEqual(first.status_code, 201, first.content)
        second = self.client.post(reverse("customer-cart-items"), self.payload(4, "White"), format="json")
        self.assertEqual(second.status_code, 201, second.content)
        item_id = first.data["data"]["items"][0]["id"]
        response = self.client.patch(reverse("customer-cart-item-detail", args=[item_id]), {"qty": 7}, format="json")
        self.assertEqual(response.status_code, 400, response.content)
        self.assertEqual(self.client.post(reverse("customer-cart-items"), self.payload(), format="json").status_code, 400)
