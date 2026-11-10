"""Recipient mobile number validation: Indian mobile numbers only, written
as 9876543210, 919876543210 or +919876543210, stored as the bare 10 digits."""
from unittest import mock

from django.test import SimpleTestCase, override_settings
from django.urls import reverse
from rest_framework import status
from rest_framework.test import APITestCase

from common import discounts
from common.test_utils import AuthenticatedAPITestCase
from orders.models import Order, OrderRecipient, RecipientEmailAllocation, RecipientEmailReservation
from orders.tests import _make_address, _seed_cart_item
from payments import tests as payment_test_helpers
from payments.models import CheckoutSession
from payments.services import (
    RECIPIENT_PHONE_INVALID_MESSAGE,
    CheckoutError,
    normalize_recipient_mobile,
    validate_recipients,
)
from payments.tests import KEY_SECRET, WEBHOOK_SECRET, _guest_payload

VALID = {
    "9876543210": "9876543210",
    "8765432109": "8765432109",
    "7654321098": "7654321098",
    "6654321098": "6654321098",
    "919876543210": "9876543210",
    "+919876543210": "9876543210",
    " +919876543210 ": "9876543210",  # surrounding whitespace is trimmed, as for every recipient field
}

INVALID = {
    "invalid starting digit": "5876543210",
    "starts with 0": "0987654321",
    "fewer than 10 digits": "987654321",
    "more than 10 digits": "98765432101",
    "+91 with invalid starting digit": "+915876543210",
    "91 with too few digits": "91987654321",
    "91 with too many digits": "9198765432100",
    "letters": "98765abc10",
    "other country code": "+441234567890",
    "inner spaces": "98765 43210",
    "+91 with space": "+91 9876543210",
    "hyphen": "98765-43210",
    "parentheses": "(98765)43210",
    "duplicated +91": "+91919876543210",
    "duplicated 91": "91919876543210",
    "plus without 91": "+9876543210",
    "+ in the middle": "91+9876543210",
    "double plus": "++919876543210",
    "0091 prefix": "00919876543210",
    "non-ASCII digits": "٩٨٧٦٥٤٣٢١٠",
    "blank": "",
    "not a string": 9876543210,
}


def recipient(index=1, phone="9876543210"):
    return {"full_name": f"Recipient {index}", "email": f"phone.recipient{index}@example.com", "phone": phone}


class NormalizeRecipientMobileTests(SimpleTestCase):
    def test_accepted_formats_normalize_to_ten_digits(self):
        for raw, expected in VALID.items():
            with self.subTest(raw=raw):
                self.assertEqual(normalize_recipient_mobile(raw), expected)

    def test_rejected_formats_return_none(self):
        for label, raw in INVALID.items():
            with self.subTest(label=label, raw=raw):
                self.assertIsNone(normalize_recipient_mobile(raw))


class ValidateRecipientsPhoneTests(APITestCase):
    def test_each_accepted_format_is_stored_as_ten_digits(self):
        for raw, expected in VALID.items():
            with self.subTest(raw=raw):
                cleaned = validate_recipients([recipient(phone=raw)], 1)
                self.assertEqual(cleaned[0]["phone"], expected)

    def test_each_invalid_number_is_rejected_with_a_field_specific_error(self):
        for label, raw in INVALID.items():
            with self.subTest(label=label, raw=raw):
                with self.assertRaises(CheckoutError) as caught:
                    validate_recipients([recipient(phone=raw)], 1)
                self.assertEqual(caught.exception.errors, {"recipients": {"0": {"phone": [RECIPIENT_PHONE_INVALID_MESSAGE]}}})

    def test_multiple_recipients_with_different_accepted_formats(self):
        cleaned = validate_recipients(
            [recipient(1, "9876543210"), recipient(2, "918765432109"), recipient(3, "+917654321098")], 3
        )
        self.assertEqual([r["phone"] for r in cleaned], ["9876543210", "8765432109", "7654321098"])

    def test_one_invalid_recipient_among_valid_ones_is_rejected_on_its_own_slot(self):
        with self.assertRaises(CheckoutError) as caught:
            validate_recipients([recipient(1), recipient(2, "+441234567890"), recipient(3)], 3)
        self.assertEqual(caught.exception.errors, {"recipients": {"1": {"phone": [RECIPIENT_PHONE_INVALID_MESSAGE]}}})

    def test_name_and_email_errors_are_still_reported_alongside_the_phone(self):
        with self.assertRaises(CheckoutError) as caught:
            validate_recipients([{"full_name": "", "email": "invalid", "phone": "123"}], 1)
        self.assertEqual(set(caught.exception.errors["recipients"]["0"]), {"full_name", "email", "phone"})

    def test_previous_rule_is_kept_only_when_explicitly_requested(self):
        # Used by _fulfill for sessions already validated and paid for.
        cleaned = validate_recipients([recipient(phone="+44 7700 900123")], 1, indian_mobile=False)
        self.assertEqual(cleaned[0]["phone"], "+447700900123")


@override_settings(
    RAZORPAY_KEY_ID="rzp_test_key", RAZORPAY_KEY_SECRET=KEY_SECRET,
    RAZORPAY_WEBHOOK_SECRET=WEBHOOK_SECRET, DUMMY_PAYMENTS_ENABLED=False,
    ONBOARDING_EMAIL_SYNC=True, BREVO_API_KEY="",
    EMAIL_BACKEND="django.core.mail.backends.locmem.EmailBackend",
    PASSWORD_HASHERS=["django.contrib.auth.hashers.MD5PasswordHasher"],
)
class GuestCheckoutRecipientPhoneTests(APITestCase):
    _fake_create_order = payment_test_helpers.RazorpayOnboardingTests._fake_create_order
    _email_token = payment_test_helpers.RazorpayOnboardingTests._email_token
    _with_token = payment_test_helpers.RazorpayOnboardingTests._with_token
    _checkout = payment_test_helpers.RazorpayOnboardingTests._checkout
    _verify = payment_test_helpers.RazorpayOnboardingTests._verify

    def setUp(self):
        payment_test_helpers.RazorpayOnboardingTests.setUp(self)

    def _payload(self, phones, email="phone.buyer@example.com"):
        payload = _guest_payload(email=email, qty=len(phones))
        payload["recipients"] = [recipient(index, phone) for index, phone in enumerate(phones)]
        return payload

    def test_invalid_recipient_number_is_rejected_before_a_session_or_reservation_exists(self):
        payload = self._with_token(self._payload(["9876543210", "5876543210"]))
        response = self.client.post(reverse("razorpay-checkout"), payload, format="json")
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST, response.content)
        self.assertEqual(response.data["errors"]["recipients"]["1"]["phone"], [RECIPIENT_PHONE_INVALID_MESSAGE])
        self.assertFalse(CheckoutSession.objects.exists())
        self.assertFalse(RecipientEmailReservation.objects.exists())

    def test_mixed_accepted_formats_are_paid_for_and_stored_normalized(self):
        checkout = self._checkout(self._payload(["9876543210", "918765432109", "+917654321098"]))
        self.assertEqual(
            [r["phone"] for r in CheckoutSession.objects.get().recipients],
            ["9876543210", "8765432109", "7654321098"],
        )
        response = self._verify(checkout)
        self.assertEqual(response.status_code, status.HTTP_200_OK, response.content)
        order = Order.objects.get(pk=response.data["data"]["order_id"])
        self.assertEqual(
            list(order.recipients.order_by("pk").values_list("phone", flat=True)),
            ["9876543210", "8765432109", "7654321098"],
        )

    def test_session_created_before_the_rule_still_fulfills_after_payment(self):
        checkout = self._checkout(self._payload(["9876543210"]))
        session = CheckoutSession.objects.get()
        session.recipients = [{**session.recipients[0], "phone": "+447700900123"}]
        session.save(update_fields=["recipients"])
        response = self._verify(checkout)
        self.assertEqual(response.status_code, status.HTTP_200_OK, response.content)
        self.assertEqual(OrderRecipient.objects.get().phone, "+447700900123")


class AuthenticatedOrderRecipientPhoneTests(AuthenticatedAPITestCase):
    def setUp(self):
        super().setUp()
        self.address = _make_address(self.user)
        patcher = mock.patch.object(discounts, "FIRST_ORDER_DISCOUNT_ENABLED", False)
        patcher.start()
        self.addCleanup(patcher.stop)

    def _post(self, phones):
        _seed_cart_item(self.user, qty=len(phones))
        payload = {
            "shipping": "49.00",
            "payment_method": "COD",
            "address_id": self.address.pk,
            "recipients": [recipient(index, phone) for index, phone in enumerate(phones)],
        }
        return self.client.post(reverse("my-orders"), payload, format="json")

    def test_invalid_recipient_number_cannot_create_an_order(self):
        response = self._post(["9876543210", "98765abc10"])
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST, response.content)
        self.assertEqual(response.data["errors"]["recipients"]["1"]["phone"], [RECIPIENT_PHONE_INVALID_MESSAGE])
        self.assertFalse(Order.objects.exists())
        self.assertFalse(RecipientEmailAllocation.objects.exists())

    def test_valid_recipient_numbers_create_an_order_with_normalized_phones(self):
        response = self._post(["+919876543210", "918765432109"])
        self.assertEqual(response.status_code, status.HTTP_201_CREATED, response.content)
        order = Order.objects.get(pk=response.data["data"]["id"])
        self.assertEqual(
            list(order.recipients.order_by("pk").values_list("phone", flat=True)),
            ["9876543210", "8765432109"],
        )
