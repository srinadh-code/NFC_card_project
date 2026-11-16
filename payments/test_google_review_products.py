"""Product-scoped allocation through the existing verified payment workflow."""

from types import SimpleNamespace
import re

from django.core import mail
from django.core.cache import cache
from django.db import IntegrityError, transaction
from django.test import override_settings
from django.urls import reverse
from rest_framework.test import APITestCase

from common.test_utils import make_user
from nfc_cards.models import NfcCard
from orders.models import Order, RecipientEmailAllocation, RecipientEmailReservation, Transaction
from orders.pricing import ProductUnavailable, price_lines
from payments import tests as fixtures
from payments.models import CheckoutSession
from payments.services import is_recipient_email_available
from profiles.models import Profile


@override_settings(
    RAZORPAY_KEY_ID="rzp_test_key", RAZORPAY_KEY_SECRET=fixtures.KEY_SECRET,
    RAZORPAY_WEBHOOK_SECRET=fixtures.WEBHOOK_SECRET,
    ONBOARDING_EMAIL_SYNC=True, BREVO_API_KEY="", DUMMY_PAYMENTS_ENABLED=False,
    EMAIL_BACKEND="django.core.mail.backends.locmem.EmailBackend",
    FRONTEND_URL="https://shop.example.com", PUBLIC_NFC_BASE_URL="",
)
class GoogleReviewProductPaymentTests(APITestCase):
    # Reuse the existing provider/OTP fixtures, not a second payment flow.
    _fake_create_order = fixtures.RazorpayOnboardingTests._fake_create_order
    _email_token = fixtures.RazorpayOnboardingTests._email_token
    _with_token = fixtures.RazorpayOnboardingTests._with_token
    _checkout = fixtures.RazorpayOnboardingTests._checkout
    _verify = fixtures.RazorpayOnboardingTests._verify
    _webhook = fixtures.RazorpayOnboardingTests._webhook

    def setUp(self):
        cache.clear()
        fixtures.RazorpayOnboardingTests.setUp(self)

    def payload(self, emails, *, buyer="buyer@example.com", product="google-review"):
        payload = fixtures._guest_payload(email=buyer, product_id=f"PRD-NEXORA-{product.upper()}", qty=len(emails))
        payload["recipients"] = [
            {"full_name": f"Recipient {index + 1}", "email": email, "phone": "9876543210"}
            for index, email in enumerate(emails)
        ]
        return payload

    def pay(self, payload):
        checkout = self._checkout(payload)
        response = self._verify(checkout, payment_id=f"pay_{self._order_seq}")
        self.assertEqual(response.status_code, 200, response.content)
        return checkout, Order.objects.get(pk=response.data["data"]["order_id"])

    def test_review_self_uses_verified_payment_catalog_price_and_one_account(self):
        _, order = self.pay(self.payload(["buyer@example.com"]))
        recipient = order.recipients.get()
        self.assertEqual(recipient.user_id, order.customer_id)
        self.assertEqual(recipient.card_type, "REVIEW")
        self.assertEqual(recipient.email_allocation.card_type, "REVIEW")
        self.assertEqual(str(order.items.get().price), "499.00")
        self.assertEqual(order.transactions.filter(status="PAID").count(), 1)
        self.assertEqual(NfcCard.objects.count(), 0)

    def test_review_other_recipients_keep_buyer_and_every_slot_independent(self):
        for quantity in (1, 3, 10):
            with self.subTest(quantity=quantity):
                cache.clear()
                emails = [f"recipient-{quantity}-{index}@example.com" for index in range(quantity)]
                _, order = self.pay(self.payload(emails, buyer=f"buyer-{quantity}@example.com"))
                self.assertEqual(order.recipients.count(), quantity)
                self.assertFalse(order.recipients.filter(user=order.customer).exists())
                self.assertEqual(set(order.recipients.values_list("card_type", flat=True)), {"REVIEW"})
                self.assertEqual(set(order.recipients.values_list("email", flat=True)), set(emails))
                self.assertTrue(all(row.user_id and row.profile_id for row in order.recipients.all()))

    def test_same_email_can_receive_digital_and_review_in_one_mixed_order(self):
        payload = self.payload(["both@example.com", " BOTH@example.com "])
        payload["items"] = [
            {"product_id": "PRD-NEXORA-CUSTOM", "qty": 1},
            {"product_id": "PRD-NEXORA-GOOGLE-REVIEW", "qty": 1},
        ]
        payload["recipients"][0].update(card_type="CUSTOM", product_id="PRD-NEXORA-CUSTOM")
        payload["recipients"][1].update(card_type="REVIEW", product_id="PRD-NEXORA-GOOGLE-REVIEW")
        _, order = self.pay(payload)
        rows = list(order.recipients.all())
        self.assertEqual(len(rows), 2)
        self.assertEqual(rows[0].user_id, rows[1].user_id)
        self.assertEqual(rows[0].profile_id, rows[1].profile_id)
        self.assertEqual({row.card_type for row in rows}, {"CUSTOM", "REVIEW"})
        self.assertEqual({row.email_allocation.card_type for row in rows}, {"CUSTOM", "REVIEW"})
        self.assertEqual(sum(item.qty for item in order.items.all()), 2)

    def test_bulk_payment_keeps_original_product_and_contact_slots_when_claims_lock_in_email_order(self):
        payload = self.payload(["z-last@example.com", "a-first@example.com", "a-first@example.com"])
        payload["items"] = [
            {"product_id": "PRD-NEXORA-GOOGLE-REVIEW", "qty": 2},
            {"product_id": "PRD-NEXORA-CUSTOM", "qty": 1},
        ]
        _, order = self.pay(payload)
        rows = list(order.recipients.order_by("pk"))
        self.assertEqual(
            [(row.name, row.email, row.card_type, row.email_allocation.normalized_email, row.email_allocation.card_type) for row in rows],
            [
                ("Recipient 1", "z-last@example.com", "REVIEW", "z-last@example.com", "REVIEW"),
                ("Recipient 2", "a-first@example.com", "REVIEW", "a-first@example.com", "REVIEW"),
                ("Recipient 3", "a-first@example.com", "CUSTOM", "a-first@example.com", "CUSTOM"),
            ],
        )
        self.assertEqual(rows[1].user_id, rows[2].user_id)
        self.assertNotEqual(rows[0].user_id, rows[1].user_id)
        self.assertEqual(order.transactions.filter(status="PAID").count(), 1)

    def test_existing_digital_owner_can_buy_review_without_account_or_profile_changes(self):
        user = make_user(email="both@example.com", full_name="Existing Customer")
        profile = Profile.ensure_for_user(user)
        profile.selected_template, profile.company = "future", "Existing Company"
        profile.save(update_fields=["selected_template", "company"])
        original_password = user.password
        NfcCard.objects.create(uid="DIGITAL-OWNED", serial_number="DIGITAL-OWNED", user=user, status="ACTIVE", card_type="CUSTOM")
        _, order = self.pay(self.payload(["both@example.com"]))
        recipient = order.recipients.get()
        self.assertEqual(recipient.user_id, user.pk)
        user.refresh_from_db()
        profile.refresh_from_db()
        self.assertEqual(user.password, original_password)
        self.assertEqual((profile.selected_template, profile.company), ("future", "Existing Company"))
        self.assertEqual(type(user).objects.filter(email__iexact=user.email).count(), 1)

    def test_review_recipient_can_later_receive_digital_without_merging_orders(self):
        _, review = self.pay(self.payload(["both@example.com"]))
        recipient_user_id = review.recipients.get().user_id
        review_snapshot = (review.purchaser_name, review.purchaser_email, review.amount)
        _, digital = self.pay(self.payload(["both@example.com"], buyer="second-buyer@example.com", product="custom"))
        self.assertNotEqual(digital.pk, review.pk)
        self.assertEqual(digital.recipients.get().user_id, recipient_user_id)
        review.refresh_from_db()
        self.assertEqual((review.purchaser_name, review.purchaser_email, review.amount), review_snapshot)

    def test_duplicate_review_reservation_is_rejected_before_creating_another_payment(self):
        self._checkout(self.payload(["reserved@example.com"]))
        payload = self._with_token(self.payload(["reserved@example.com"], buyer="other-buyer@example.com"))
        response = self.client.post(reverse("razorpay-checkout"), payload, format="json")
        self.assertEqual(response.status_code, 400, response.content)
        self.assertEqual(self.create_order.call_count, 1)
        self.assertEqual(CheckoutSession.objects.count(), 1)

    def test_deleted_checkout_reservation_does_not_block_a_new_purchase_or_delete_history(self):
        for product, card_type in (("custom", "CUSTOM"), ("google-review", "REVIEW")):
            with self.subTest(product=product):
                cache.clear()
                email = f"cleaned-{product}@example.com"
                checkout = self._checkout(self.payload([email], product=product))
                session = CheckoutSession.objects.get(public_id=checkout["checkout_id"])
                reservation = RecipientEmailReservation.objects.get(checkout_session_id=session.public_id)
                allocation_id, old_session_id = reservation.allocation_id, session.public_id
                # Model the reported partial local cleanup in this isolated DB.
                # UUID reservations are intentionally not a checkout foreign key.
                session.delete()

                response = self.client.post(reverse("recipient-email-availability"), {
                    "email": f" {email.upper()} ", "buyer_email": "next-buyer@example.com",
                    "card_type": card_type,
                }, format="json")
                self.assertEqual(response.status_code, 200, response.content)
                self.assertTrue(response.data["data"]["available"])
                _, order = self.pay(self.payload([email], buyer="next-buyer@example.com", product=product))
                self.assertEqual(order.recipients.get().email_allocation_id, allocation_id)
                # Eligibility never silently deletes old allocation/reservation data.
                self.assertTrue(RecipientEmailReservation.objects.filter(
                    pk=reservation.pk, checkout_session_id=old_session_id,
                ).exists())

    def test_live_reservation_holds_only_its_product_and_survives_an_orphan_hold(self):
        import uuid

        email = "live-and-orphan@example.com"
        checkout = self._checkout(self.payload([email]))
        allocation = RecipientEmailAllocation.objects.get(normalized_email=email, card_type="REVIEW")
        RecipientEmailReservation.objects.create(allocation=allocation, checkout_session_id=uuid.uuid4())
        self.assertFalse(is_recipient_email_available(email, card_type="REVIEW"))
        self.assertTrue(is_recipient_email_available(email, card_type="CUSTOM"))
        paid = self._verify(checkout)
        self.assertEqual(paid.status_code, 200, paid.content)
        self.assertFalse(is_recipient_email_available(email, card_type="REVIEW"))
        self.assertTrue(is_recipient_email_available(email, card_type="CUSTOM"))

    def test_duplicate_same_type_in_one_checkout_is_still_rejected(self):
        payload = self._with_token(self.payload(["same@example.com", " SAME@example.com "]))
        response = self.client.post(reverse("razorpay-checkout"), payload, format="json")
        self.assertEqual(response.status_code, 400, response.content)
        self.create_order.assert_not_called()

    def test_recipient_cannot_forge_a_different_product(self):
        for field, value in (("card_type", "CUSTOM"), ("product_id", "PRD-NEXORA-CUSTOM")):
            with self.subTest(field=field):
                cache.clear()
                payload = self.payload(["recipient@example.com"])
                payload["recipients"][0][field] = value
                response = self.client.post(reverse("razorpay-checkout"), self._with_token(payload), format="json")
                self.assertEqual(response.status_code, 400, response.content)
        self.create_order.assert_not_called()

    def test_cart_item_cannot_impersonate_the_other_catalog_product(self):
        for product_id, card_type in (("PRD-NEXORA-GOOGLE-REVIEW", "CUSTOM"), ("PRD-NEXORA-CUSTOM", "REVIEW")):
            line = SimpleNamespace(product_id=product_id, card_type=card_type, name="Forged", color_name="Black", qty=1, price="0.01")
            with self.subTest(product_id=product_id), self.assertRaises(ProductUnavailable):
                price_lines([line])

    def test_wooden_and_custom_share_digital_limit_but_not_review_limit(self):
        user = make_user(email="wooden@example.com")
        NfcCard.objects.create(uid="WOODEN-OWNED", serial_number="WOODEN-OWNED", user=user, card_type="WOODEN", status="ASSIGNED")
        self.assertFalse(is_recipient_email_available(user.email, card_type="CUSTOM"))
        self.assertFalse(is_recipient_email_available(user.email, card_type="WOODEN"))
        self.assertTrue(is_recipient_email_available(user.email, card_type="REVIEW"))

    def test_physical_ownership_limits_match_assignment_for_every_card_status(self):
        from common.card_products import allocation_card_type

        for owned_type in ("CUSTOM", "WOODEN", "REVIEW"):
            for status in NfcCard.Status.values:
                email = f"{owned_type}-{status}@example.com".lower()
                owner = make_user(email=email)
                card = NfcCard.objects.create(uid=email.split("@")[0], serial_number=f"OWN-{owner.pk}",
                                              user=owner, card_type=owned_type, status=status)
                for purchased_type in ("CUSTOM", "WOODEN", "REVIEW"):
                    with self.subTest(owned_type=owned_type, status=status, purchased_type=purchased_type):
                        self.assertEqual(is_recipient_email_available(f" {email.upper()} ", card_type=purchased_type),
                                         allocation_card_type(owned_type) != allocation_card_type(purchased_type))
                card.refresh_from_db()
                self.assertEqual((card.user_id, card.status), (owner.pk, status))

        inventory_owner = make_user(email="no-owned-card@example.com")
        NfcCard.objects.create(uid="UNOWNED-STOCK", serial_number="UNOWNED-STOCK", card_type="REVIEW")
        self.assertTrue(is_recipient_email_available(inventory_owner.email, card_type="CUSTOM"))
        self.assertTrue(is_recipient_email_available(inventory_owner.email, card_type="REVIEW"))

    def test_old_paid_recipient_without_claim_fk_still_protects_only_its_product(self):
        _, order = self.pay(self.payload(["legacy@example.com"]))
        order.recipients.update(email_allocation=None)
        RecipientEmailAllocation.objects.filter(normalized_email="legacy@example.com").delete()
        self.assertFalse(is_recipient_email_available("legacy@example.com", card_type="REVIEW"))
        self.assertTrue(is_recipient_email_available("legacy@example.com", card_type="CUSTOM"))

    def test_pre_upgrade_checkout_snapshot_and_blank_claim_can_finish_idempotently(self):
        checkout = self._checkout(self.payload(["legacy@example.com"]))
        session = CheckoutSession.objects.get(public_id=checkout["checkout_id"])
        session.recipients = [
            {key: value for key, value in row.items() if key not in ("card_type", "product_id")}
            for row in session.recipients
        ]
        session.save(update_fields=["recipients"])
        RecipientEmailAllocation.objects.filter(normalized_email="legacy@example.com").update(card_type="")
        first = self._verify(checkout)
        second = self._verify(checkout)
        self.assertEqual((first.status_code, second.status_code), (200, 200))
        order = Order.objects.get()
        self.assertEqual(order.recipients.get().card_type, "REVIEW")
        self.assertEqual(order.recipients.get().email_allocation.card_type, "REVIEW")
        self.assertEqual(Transaction.objects.count(), 1)

    def test_database_prevents_duplicate_same_product_claim_but_allows_both(self):
        RecipientEmailAllocation.objects.create(normalized_email="identity@example.com", owner_email="buyer@example.com", card_type="CUSTOM")
        RecipientEmailAllocation.objects.create(normalized_email="identity@example.com", owner_email="buyer@example.com", card_type="REVIEW")
        with self.assertRaises(IntegrityError), transaction.atomic():
            RecipientEmailAllocation.objects.create(normalized_email="identity@example.com", owner_email="other@example.com", card_type="REVIEW")
        self.assertEqual(RecipientEmailAllocation.objects.filter(normalized_email="identity@example.com").count(), 2)

    def test_review_full_paid_order_to_real_authenticated_settings_and_public_scan(self):
        from analytics.models import TapEvent

        _, order = self.pay(self.payload(["workflow-recipient@example.com"]))
        recipient = order.recipients.get()
        admin = make_user(email="workflow-admin@example.com", role="ADMIN", is_staff=True)
        self.client.force_authenticate(admin)
        processing = self.client.post(reverse("admin-order-status", args=[order.pk]), {"status": "PROCESSING"}, format="json")
        self.assertEqual(processing.status_code, 200, processing.content)
        activation_messages = [message for message in mail.outbox if message.to == [recipient.email]
                               and "/set-password?token=" in message.body]
        self.assertEqual(len(activation_messages), 1)
        self.assertIn("Google Review", activation_messages[0].body)
        token = re.search(r"/set-password\?token=([\w.\-]+)", activation_messages[0].body).group(1)
        self.client.force_authenticate(None)
        setup = self.client.post(reverse("auth-activation-complete"), {
            "token": token, "new_password": fixtures.NEW_PASSWORD, "confirm_password": fixtures.NEW_PASSWORD,
        }, format="json")
        self.assertEqual(setup.status_code, 200, setup.content)
        login = self.client.post(reverse("auth-login"), {"email": recipient.email, "password": fixtures.NEW_PASSWORD}, format="json")
        self.assertEqual(login.status_code, 200, login.content)
        access = login.data["data"]["access"]
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {access}")
        workspace_url = reverse("customer-google-review")
        workspace = self.client.get(workspace_url)
        self.assertTrue(workspace.data["data"]["eligible"])
        self.assertFalse(workspace.data["data"]["digital_access"])
        destination = "https://search.google.com/local/writereview?placeid=ChIJ_Workflow123"
        saved = self.client.patch(workspace_url, {"business_name": "Workflow Studio", "google_review_url": destination}, format="json")
        self.assertEqual(saved.status_code, 200, saved.content)

        self.client.force_authenticate(admin)
        assigned = self.client.post(reverse("admin-cards"), {
            "card_type": "REVIEW", "customer_email": recipient.email, "recipient_id": recipient.pk,
            "uid": "WORKFLOW-REVIEW", "serial_number": "WORKFLOW-REVIEW",
        }, format="json")
        self.assertEqual(assigned.status_code, 201, assigned.content)
        card_id = assigned.data["data"]["id"]
        recipient.refresh_from_db()
        self.assertEqual(recipient.assigned_card_id, card_id)
        self.client.force_authenticate(None)
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {access}")
        activated = self.client.post(reverse("nfc-cards-activate-assigned", args=[card_id]), format="json")
        self.assertEqual(activated.status_code, 200, activated.content)
        workspace = self.client.get(workspace_url).data["data"]
        self.assertTrue(workspace["configured"])
        self.assertTrue(workspace["qr_url"].endswith("/nfc/WORKFLOW-REVIEW?source=qr"))
        self.client.credentials()
        public_url = reverse("nfc-cards-resolve", args=["WORKFLOW-REVIEW"])
        for source in ({}, {"source": "qr"}):
            resolved = self.client.get(public_url, source)
            self.assertEqual(resolved.status_code, 200, resolved.content)
            self.assertEqual(resolved.data["data"]["redirect_url"], destination)
        self.assertEqual(TapEvent.objects.filter(action="REVIEW_TAP").count(), 1)
        self.assertEqual(TapEvent.objects.filter(action="REVIEW_QR_SCAN").count(), 1)
