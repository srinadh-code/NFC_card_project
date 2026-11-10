"""Purchaser/recipient boundaries through the real verified payment APIs."""
import re
from concurrent.futures import ThreadPoolExecutor
from threading import Barrier
from types import SimpleNamespace
from uuid import uuid4
from unittest import mock

from django.core import mail
from django.core.cache import cache
from django.db import IntegrityError, close_old_connections, transaction
from django.test import TransactionTestCase, override_settings
from django.urls import reverse
from rest_framework.test import APITestCase

from accounts.models import CustomerOnboarding, EmailOTP, User
from accounts.onboarding import ACTIVATION_SUBJECT
from common.test_utils import make_user
from nfc_cards.models import NfcCard
from orders.models import Order, OrderRecipient, RecipientEmailAllocation, RecipientEmailReservation, Transaction
from payments.models import CheckoutSession
from payments.services import (
    CheckoutError,
    create_checkout_session,
    is_recipient_email_available,
    reserve_recipient_emails,
    validate_recipients,
)
from payments import tests as payment_test_helpers
from payments.tests import KEY_SECRET, WEBHOOK_SECRET, _guest_payload
from profiles.models import Profile
from website_content.models import OrderCardProduct


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
        detail = self.as_admin_get("admin-purchaser-detail", order.pk)
        self.assertEqual(detail["order"]["recipients"][0]["phone"], "+447700900123")
        self.assertEqual(mail.outbox[-1].to, ["rahul@example.com"])

    def test_purchaser_is_also_recipient_uses_one_account_and_profile(self):
        _, order = self.buy([recipient(email=" Rahul@Example.COM "), recipient(2), recipient(3)])
        self.assertEqual(User.objects.filter(email__iexact="rahul@example.com").count(), 1)
        self.assertEqual(order.recipients.filter(user=order.customer).count(), 1)
        self.assertEqual(Profile.objects.filter(user=order.customer).count(), 1)
        customers = self.as_admin_get("admin-customers")
        self.assertEqual(len(customers), 3)
        self.assertIn("rahul@example.com", [c["email"] for c in customers])

    def test_duplicate_normalized_emails_are_rejected_without_changing_existing_accounts(self):
        person = make_user(email="priya@example.com", full_name="Original name", phone="9000000002")
        profile = Profile.ensure_for_user(person)
        password = person.password
        with self.assertRaises(CheckoutError):
            validate_recipients(
                [recipient(email=" PRIYA@example.com "), recipient(2, "priya@example.com")],
                2,
            )
        person.refresh_from_db()
        self.assertEqual((person.password, person.full_name, person.phone), (password, "Original name", "9000000002"))
        self.assertEqual(Profile.objects.filter(user=person).count(), 1)

    def test_checkout_rejects_duplicate_recipient_emails_without_an_availability_check(self):
        payload = _guest_payload(qty=2)
        payload["recipients"] = [
            recipient(email=" Same.Recipient@example.com "),
            recipient(2, "same.recipient@EXAMPLE.com"),
        ]
        response = self.client.post(reverse("razorpay-checkout"), self._with_token(payload), format="json")

        self.assertEqual(response.status_code, 400, response.content)
        self.assertEqual(response.data["message"], "Use a different email address for each NFC card.")
        self.assertFalse(CheckoutSession.objects.exists())
        self.assertFalse(RecipientEmailAllocation.objects.exists())
        self.assertFalse(Order.objects.exists())

    def test_buyer_email_can_be_reused_across_orders_with_distinct_recipient_allocations(self):
        _, first = self.buy([recipient(), recipient(2)])
        _, second = self.buy([recipient(3), recipient(4, "recipient4@example.com"), recipient(5)])
        self.buy([recipient(6, "another.recipient@example.com")], email="another.purchaser@example.com")
        self.assertEqual(first.customer_id, second.customer_id)
        self.assertEqual(User.objects.filter(email="recipient1@example.com").count(), 1)
        self.assertEqual(Profile.objects.filter(user__email="recipient1@example.com").count(), 1)
        for order, quantity in ((first, 2), (second, 3)):
            detail = self.as_admin_get("admin-purchaser-detail", order.pk)
            self.assertEqual(detail["total_cards_purchased"], quantity)
            self.assertEqual(len(detail["order"]["recipients"]), quantity)
            self.assertEqual(detail["total_amount_paid"], str(order.total))

    def test_checkout_name_changes_preserve_paid_order_snapshots_and_existing_account_for_both_providers(self):
        for provider in ("razorpay", "dummy"):
            with self.subTest(provider=provider):
                cache.clear()
                buyer = make_user(email=f"{provider}.same@example.com", full_name="Original Account", phone="9000000001")
                profile = Profile.ensure_for_user(buyer)
                profile.company = "Original Company"
                profile.save(update_fields=["company"])
                password, username = buyer.password, profile.username
                orders = []
                for index, (name, quantity) in enumerate((("Kavya", 1), ("Manideep", 1), ("Vinay", 2))):
                    payload = _guest_payload(email=buyer.email, qty=quantity)
                    payload["contact"].update(full_name=name, phone=f"900000000{index + 2}")
                    payload["recipients"] = [recipient(slot, f"{provider}.order{index}.recipient{slot}@example.com") for slot in range(quantity)]
                    if provider == "dummy":
                        payload["provider"] = "dummy"
                    checkout = self._checkout(payload)
                    if provider == "dummy":
                        paid = self.client.post(reverse("dummy-payment-confirm"), {"checkout_id": checkout["checkout_id"], "amount": checkout["amount"]}, format="json")
                    else:
                        paid = self._verify(checkout, payment_id=f"pay_{self._order_seq}")
                    self.assertEqual(paid.status_code, 200, paid.content)
                    order = Order.objects.get(pk=paid.data["data"]["order_id"])
                    self.assertEqual((order.customer_id, order.purchaser_name, order.purchaser_email, order.purchaser_phone),
                                     (buyer.pk, name, buyer.email, f"900000000{index + 2}"))
                    orders.append(order)
                buyer.refresh_from_db()
                profile.refresh_from_db()
                self.assertEqual((buyer.full_name, buyer.phone, buyer.password), ("Original Account", "9000000001", password))
                self.assertEqual((profile.username, profile.company), (username, "Original Company"))
                self.assertEqual(User.objects.filter(email__iexact=buyer.email).count(), 1)
                self.assertEqual(buyer.orders.count(), 3)
                self.assertEqual(Transaction.objects.filter(order__customer=buyer, status="PAID").count(), 3)
                self.client.force_authenticate(self.admin)
                response = self.client.get(reverse("admin-purchasers"), {"search": buyer.email})
                self.client.force_authenticate(None)
                self.assertEqual(response.data["pagination"]["count"], 3)
                rows = {row["id"]: row for row in response.data["data"]}
                for order in orders:
                    order.refresh_from_db()
                    self.assertEqual(rows[order.pk]["name"], order.purchaser_name)
                    self.assertEqual(rows[order.pk]["total_amount_paid"], str(order.total))
                    self.assertEqual(rows[order.pk]["total_cards_purchased"], order.recipients.count())
                    detail = self.as_admin_get("admin-purchaser-detail", order.pk)
                    self.assertEqual(detail["order"]["id"], order.pk)
                    self.assertEqual({row["email"] for row in detail["order"]["recipients"]}, set(order.recipients.values_list("email", flat=True)))
                self.assertFalse(any(message.subject == ACTIVATION_SUBJECT for message in mail.outbox))
                self.client.force_authenticate(self.admin)
                processing = self.client.post(reverse("admin-order-status", args=[orders[0].pk]), {"status": "PROCESSING"}, format="json")
                self.client.force_authenticate(None)
                self.assertEqual(processing.status_code, 200, processing.content)
                setup = [message.to[0] for message in mail.outbox if message.subject == ACTIVATION_SUBJECT]
                self.assertEqual(setup, list(orders[0].recipients.values_list("email", flat=True)))

    def test_same_buyer_cannot_reuse_an_allocated_recipient_email(self):
        _, first = self.buy([recipient(email="rahul@example.com")], email="buyer@example.com")
        payload = _guest_payload(email="buyer@example.com")
        payload["recipients"] = [recipient(2, " RAHUL@example.com ")]
        response = self.client.post(reverse("razorpay-checkout"), self._with_token(payload), format="json")

        self.assertEqual(response.status_code, 400, response.content)
        self.assertIn("already assigned to another NFC card", response.data["message"])
        self.assertEqual(RecipientEmailAllocation.objects.filter(normalized_email="rahul@example.com").count(), 1)
        self.assertEqual(OrderRecipient.objects.filter(email__iexact="rahul@example.com").count(), 1)
        self.assertEqual(first.customer.email, "buyer@example.com")

    def test_registered_customer_without_an_allocated_card_can_be_a_recipient(self):
        registered = make_user(email="registered.recipient@example.com")
        checkout, order = self.buy([recipient(email=" Registered.Recipient@Example.COM ")])

        self.assertEqual(self._verify(checkout).status_code, 200)
        order_recipient = order.recipients.get()
        self.assertEqual(order_recipient.user_id, registered.pk)

    def test_checkout_with_one_allocated_email_rejects_all_recipients(self):
        self.buy([recipient(email="already.allocated@example.com")])
        payload = _guest_payload(email="second.buyer@example.com", qty=2)
        payload["recipients"] = [
            recipient(email="new.recipient@example.com"),
            recipient(2, "ALREADY.ALLOCATED@example.com"),
        ]
        response = self.client.post(reverse("razorpay-checkout"), self._with_token(payload), format="json")

        self.assertEqual(response.status_code, 400, response.content)
        self.assertIn("already assigned", response.data["errors"]["recipients"]["1"]["email"][0])
        self.assertEqual(CheckoutSession.objects.count(), 1)
        self.assertEqual(Order.objects.count(), 1)

    def test_different_buyers_cannot_allocate_the_same_recipient_email(self):
        self.buy([recipient(email="shared.recipient@example.com")], email="first.buyer@example.com")
        payload = _guest_payload(email="second.buyer@example.com")
        payload["recipients"] = [recipient(email="shared.recipient@example.com")]
        response = self.client.post(reverse("razorpay-checkout"), self._with_token(payload), format="json")
        self.assertEqual(response.status_code, 400, response.content)
        self.assertEqual(
            response.data["message"],
            "This email is already assigned to another NFC card. Please enter a different email.",
        )

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

    def test_recipient_email_availability_normalizes_and_allows_registered_user_without_card(self):
        make_user(email="registered@example.com")
        response = self.client.post(
            reverse("recipient-email-availability"),
            {"email": "  Registered@Example.COM  "},
            format="json",
        )
        self.assertEqual(response.status_code, 200, response.content)
        self.assertEqual(response.data["data"], {
            "available": True,
            "message": "Email available for NFC card allocation.",
        })

    def test_recipient_email_availability_rejects_reserved_or_allocated_email_without_account_details(self):
        self._checkout({
            **_guest_payload(),
            "recipients": [recipient(email="allocated@example.com")],
        })
        response = self.client.post(
            reverse("recipient-email-availability"),
            {"email": "ALLOCATED@example.com"},
            format="json",
        )
        self.assertEqual(response.status_code, 200, response.content)
        self.assertEqual(response.data["data"], {
            "available": False,
            "message": "This email is already assigned to another NFC card. Please enter a different email.",
        })
        self.assertNotIn("user", response.data["data"])
        self.assertNotIn("account", response.data["data"])

    def test_availability_rejects_existing_recipient_allocation_for_every_buyer(self):
        self.buy([recipient(email="buyer.self@example.com")], email="buyer.self@example.com")
        mine = self.client.post(
            reverse("recipient-email-availability"),
            {"email": "buyer.self@example.com", "buyer_email": "BUYER.SELF@example.com"},
            format="json",
        )
        theirs = self.client.post(
            reverse("recipient-email-availability"),
            {"email": "buyer.self@example.com", "buyer_email": "other.buyer@example.com"},
            format="json",
        )
        self.assertFalse(mine.data["data"]["available"])
        self.assertFalse(theirs.data["data"]["available"])

    def test_payment_confirmation_and_webhook_reject_a_stale_allocated_recipient(self):
        self.buy([recipient(email="already.assigned@example.com")], email="first.buyer@example.com")
        payload = _guest_payload(email="second.buyer@example.com")
        payload["recipients"] = [recipient(email="temporary.recipient@example.com")]
        checkout = self._checkout(payload)
        session = CheckoutSession.objects.get(public_id=checkout["checkout_id"])
        session.recipients = [recipient(email="already.assigned@example.com")]
        session.save(update_fields=["recipients"])

        verified = self._verify(checkout, payment_id="pay_rejected")
        webhook = self._webhook(
            "payment.captured",
            checkout["razorpay_order_id"],
            checkout["amount"],
            payment_id="pay_rejected",
        )

        self.assertEqual(verified.status_code, 400, verified.content)
        self.assertIn("already assigned to another NFC card", verified.data["message"])
        self.assertEqual(webhook.status_code, 200, webhook.content)
        session.refresh_from_db()
        self.assertEqual(session.status, CheckoutSession.Status.CREATED)
        self.assertEqual(Order.objects.count(), 1)
        self.assertEqual(Transaction.objects.count(), 1)

    def test_recipient_email_availability_returns_user_facing_invalid_message(self):
        response = self.client.post(
            reverse("recipient-email-availability"),
            {"email": "not-an-email"},
            format="json",
        )
        self.assertEqual(response.status_code, 400, response.content)
        self.assertEqual(response.data["message"], "Please enter a valid email address.")

    def test_database_unique_key_rejects_concurrent_duplicate_allocations(self):
        RecipientEmailAllocation.objects.create(
            normalized_email="race@example.com",
            owner_email="first.buyer@example.com",
        )
        with self.assertRaises(IntegrityError):
            with transaction.atomic():
                RecipientEmailAllocation.objects.create(
                    normalized_email="race@example.com",
                    owner_email="second.buyer@example.com",
                )

    def test_competing_checkout_reservations_allow_only_one_recipient_allocation(self):
        email = "race.recipient@example.com"
        first_buyer = "race.first@example.com"
        second_buyer = "race.second@example.com"
        self.assertTrue(is_recipient_email_available(email, first_buyer))
        self.assertTrue(is_recipient_email_available(email, second_buyer))

        reserve_recipient_emails(uuid4(), [recipient(email=email)], first_buyer)
        with self.assertRaises(CheckoutError):
            reserve_recipient_emails(uuid4(), [recipient(email=email)], second_buyer)

        allocation = RecipientEmailAllocation.objects.get(normalized_email=email)
        self.assertEqual(allocation.owner_email, first_buyer)
        self.assertEqual(allocation.reservations.count(), 1)

    def test_failure_and_cancelled_checkout_provision_no_recipients_or_purchasers(self):
        payload = _guest_payload(qty=2)
        payload["recipients"] = [recipient(), recipient(2)]
        checkout = self._checkout(payload)
        self.assertEqual(Order.objects.count(), 0)  # closing/cancelling the payment dialog
        self._webhook("payment.failed", checkout["razorpay_order_id"], checkout["amount"])
        self.assertEqual(CheckoutSession.objects.get().status, "FAILED")
        self.assertFalse(RecipientEmailAllocation.objects.exists())
        self.assertEqual((OrderRecipient.objects.count(), Profile.objects.count()), (0, 0))
        self.assertEqual(self.as_admin_get("admin-purchasers"), [])

    def test_explicit_checkout_cancel_releases_unpaid_email_reservations(self):
        checkout = self._checkout({
            **_guest_payload(email="cancel.buyer@example.com"),
            "recipients": [recipient(email="cancel.recipient@example.com")],
        })
        self.assertEqual(RecipientEmailAllocation.objects.count(), 1)
        response = self.client.post(
            reverse("checkout-cancel"),
            {"checkout_id": checkout["checkout_id"]},
            format="json",
        )
        self.assertEqual(response.status_code, 200, response.content)
        self.assertEqual(CheckoutSession.objects.get().status, CheckoutSession.Status.FAILED)
        self.assertFalse(RecipientEmailAllocation.objects.exists())

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
        summary = self.as_admin_get("admin-purchaser-detail", order.pk)
        self.assertEqual((summary["name"], summary["phone"]), ("Purchaser Name", "+447700900111"))
        self.client.force_authenticate(self.admin)
        matched = self.client.get(reverse("admin-purchasers"), {"search": "Purchaser Name"})
        self.assertEqual([row["id"] for row in matched.data["data"]], [order.pk])
        self.client.force_authenticate(None)
        add_card()
        self.client.force_authenticate(buyer)
        cod = self.client.post(reverse("my-orders"), {"payment_method": "COD", "address_id": address.pk, "recipients": [recipient(email="cod.recipient@example.com")], "purchaser_contact": contact}, format="json")
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
        detail = self.as_admin_get("admin-purchaser-detail", order.pk)
        self.assertEqual((detail["total_cards_purchased"], detail["total_cards_assigned"], detail["total_cards_activated"]), (2, 2, 0))

    def test_checkout_rejects_duplicate_recipient_email_before_creating_payment_session(self):
        payload = _guest_payload(email="buyer@example.com", qty=2)
        payload["recipients"] = [recipient(email="repeat@example.com"), recipient(2, " REPEAT@example.com ")]
        payload = self._with_token(payload)
        response = self.client.post(reverse("razorpay-checkout"), payload, format="json")
        self.assertEqual(response.status_code, 400, response.content)
        self.assertIn("recipients", response.data["errors"])
        self.assertFalse(CheckoutSession.objects.exists())


@override_settings(DUMMY_PAYMENTS_ENABLED=True)
class RecipientAllocationConcurrencyTests(TransactionTestCase):
    def setUp(self):
        OrderCardProduct.objects.update_or_create(
            slug="custom",
            defaults={
                "name": "GATEWAY Custom",
                "price": "999.00",
                "card_type": "CUSTOM",
                "is_active": True,
                "is_published": True,
            },
        )

    def test_concurrent_checkout_attempts_only_claim_one_recipient_email(self):
        email = "concurrent.recipient@example.com"
        start = Barrier(2)
        address = {
            "phone": "9876543210",
            "address_line1": "Plot 12, Main Road",
            "address_line2": "",
            "landmark": "",
            "locality": "Moazzampura",
            "city": "Hyderabad",
            "district": "Hyderabad",
            "state": "Telangana",
            "pincode": "500001",
            "country": "India",
            "latitude": None,
            "longitude": None,
        }

        def checkout(owner_email):
            close_old_connections()
            try:
                start.wait(timeout=5)
                create_checkout_session(
                    contact={"full_name": "Checkout Buyer", "email": owner_email, "phone": "9876543210"},
                    address=address,
                    items=[{"product_id": "PRD-NEXORA-CUSTOM", "qty": 1}],
                    recipients=[recipient(email=email)],
                    email_token="already-verified",
                    provider=CheckoutSession.Provider.DUMMY,
                )
                return "allocated"
            except CheckoutError:
                return "rejected"
            finally:
                close_old_connections()

        with (
            mock.patch("payments.services.verification.check_token", return_value=True),
            mock.patch("payments.services.pincode_service.verify_address", return_value=SimpleNamespace(errors={})),
            ThreadPoolExecutor(max_workers=2) as executor,
        ):
            results = list(executor.map(
                checkout,
                ["concurrent.first@example.com", "concurrent.second@example.com"],
            ))

        self.assertCountEqual(results, ["allocated", "rejected"])
        self.assertEqual(CheckoutSession.objects.count(), 1)
        self.assertEqual(RecipientEmailAllocation.objects.filter(normalized_email=email).count(), 1)
        self.assertEqual(RecipientEmailReservation.objects.filter(allocation__normalized_email=email).count(), 1)


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
