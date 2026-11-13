"""Malformed payment input fails closed without querying or changing orders."""
import hashlib
import hmac
import json
from decimal import Decimal
from types import SimpleNamespace
from unittest import mock

from django.test import SimpleTestCase, override_settings
from django.urls import reverse
from rest_framework.test import APIClient

from accounts.models import User
from payments import razorpay
from payments.services import CheckoutError, guest_lines
from payments.tests import _guest_payload


KEY_SECRET = "offline-input-validation-key"
WEBHOOK_SECRET = "offline-input-validation-webhook"


@override_settings(
    RAZORPAY_KEY_ID="rzp_test_input_validation",
    RAZORPAY_KEY_SECRET=KEY_SECRET,
    RAZORPAY_WEBHOOK_SECRET=WEBHOOK_SECRET,
)
class PaymentInputValidationSecurityTests(SimpleTestCase):
    def setUp(self):
        self.client = APIClient()

    def test_malformed_payment_signatures_return_the_normal_validation_error(self):
        for signature in (None, "", "\u00e9" * 64, "g" * 64, "a" * 63, "a" * 65, {}, []):
            with self.subTest(signature=repr(signature)[:90]), mock.patch("payments.views.fulfill_checkout") as fulfill:
                response = self.client.post(reverse("razorpay-verify"), {
                    "razorpay_order_id": "order_test_input",
                    "razorpay_payment_id": "pay_test_input",
                    "razorpay_signature": signature,
                }, format="json")
                self.assertEqual(response.status_code, 400)
                self.assertEqual(response.data["errors"]["code"], "invalid_signature")
                fulfill.assert_not_called()

    def test_non_ascii_webhook_signature_is_rejected_before_processing(self):
        with mock.patch("payments.views.fulfill_checkout") as fulfill:
            response = self.client.post(
                reverse("razorpay-webhook"), data=b'{"event":"payment.captured"}',
                content_type="application/json", HTTP_X_RAZORPAY_SIGNATURE="\u00e9" * 64,
            )
        self.assertEqual(response.status_code, 400)
        fulfill.assert_not_called()

    def test_valid_payment_signature_still_reaches_the_existing_fulfillment_path(self):
        order_id, payment_id = "order_test_input", "pay_test_input"
        signature = hmac.new(KEY_SECRET.encode(), f"{order_id}|{payment_id}".encode(), hashlib.sha256).hexdigest()
        with mock.patch("payments.views.fulfill_checkout", side_effect=CheckoutError("Unknown payment.", status=404)) as fulfill:
            response = self.client.post(reverse("razorpay-verify"), {
                "razorpay_order_id": order_id, "razorpay_payment_id": payment_id,
                "razorpay_signature": signature,
            }, format="json")
        self.assertEqual(response.status_code, 404)
        fulfill.assert_called_once_with(order_id, payment_id, via="verify")
        self.assertFalse(razorpay.verify_payment_signature("different-order", payment_id, signature))

    def test_valid_webhook_signature_still_accepts_an_ignored_event(self):
        raw = json.dumps({"event": "test.ignored"}).encode()
        signature = hmac.new(WEBHOOK_SECRET.encode(), raw, hashlib.sha256).hexdigest()
        response = self.client.post(reverse("razorpay-webhook"), data=raw,
                                    content_type="application/json", HTTP_X_RAZORPAY_SIGNATURE=signature)
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["message"], "Ignored.")

    def test_invalid_address_ids_are_rejected_before_any_address_query(self):
        self.client.force_authenticate(User(id=1, email="owner@example.com", role=User.Role.CUSTOMER))
        for address_id in ({"bad": "value"}, [], [1], "invalid", "9" * 5000, True, False, 0, -1, 1.5, "1.5", 2**63):
            with self.subTest(address_id=repr(address_id)[:90]), mock.patch("payments.services.CustomerAddress.objects.filter") as query:
                response = self.client.post(reverse("razorpay-checkout"), {"address_id": address_id}, format="json")
                self.assertEqual(response.status_code, 400)
                self.assertIn("address_id", response.data["errors"])
                query.assert_not_called()

    def test_valid_address_ids_keep_the_existing_owner_scoped_lookup(self):
        user = User(id=1, email="owner@example.com", role=User.Role.CUSTOMER)
        self.client.force_authenticate(user)
        for address_id in (1, "1", 1.0):
            with self.subTest(address_id=address_id), mock.patch("payments.services.CustomerAddress.objects.filter") as query:
                query.return_value.first.return_value = None
                response = self.client.post(reverse("razorpay-checkout"), {"address_id": address_id}, format="json")
                self.assertEqual(response.status_code, 400)
                self.assertEqual(response.data["errors"]["address_id"], ["Not found."])
                query.assert_called_once_with(pk=1, customer=user)

    def test_guest_quantity_types_and_extremes_have_a_validation_error(self):
        quantities = (None, {}, [], True, False, 0, -1, 11, 1.5, float("inf"), float("nan"),
                      "1.0", "1e1", " 1", "1 ", "\u0661", "9" * 5000, "0" * 5000, 10**5000)
        with mock.patch("payments.services.get_catalog_product") as catalog:
            for index, qty in enumerate(quantities):
                with self.subTest(index=index):
                    with self.assertRaises(CheckoutError) as raised:
                        guest_lines([{"product_id": "PRD-NEXORA-CUSTOM", "qty": qty}])
                    self.assertEqual(raised.exception.status, 400)
                    self.assertIn("Quantity must be between 1 and 10", raised.exception.message)
            catalog.assert_not_called()

    def test_valid_guest_quantities_keep_catalog_authoritative_fields(self):
        product = SimpleNamespace(name="Catalog card", card_type="CUSTOM", color_name="Black", price=Decimal("999.00"))
        with mock.patch("payments.services.get_catalog_product", return_value=product):
            for raw, expected in ((1, 1), (10, 10), ("1", 1), ("10", 10), ("00001", 1), ("0" * 5000 + "10", 10)):
                with self.subTest(quantity_length=len(str(raw))):
                    line = guest_lines([{"product_id": "PRD-NEXORA-CUSTOM", "qty": raw, "price": "0.01", "name": "Forged"}])[0]
                    self.assertEqual((line.qty, line.price, line.name), (expected, product.price, product.name))

    def test_overlong_guest_quantity_returns_400_through_checkout(self):
        payload = _guest_payload()
        payload["items"][0]["qty"] = "9" * 5000
        with mock.patch("payments.services.verification.check_token", return_value=True), \
                mock.patch("payments.services._verify_address"), \
                mock.patch("payments.razorpay.create_order") as create_order:
            response = self.client.post(reverse("razorpay-checkout"), payload, format="json")
        self.assertEqual(response.status_code, 400)
        self.assertIn("Quantity must be between 1 and 10", response.data["message"])
        create_order.assert_not_called()
