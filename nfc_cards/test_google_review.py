"""Review ownership, persistence, assignment, redirects and digital isolation."""
from unittest.mock import patch

from django.urls import reverse
from django.test import override_settings
from rest_framework.test import APITestCase

from accounts import onboarding
from accounts.models import User
from analytics.models import TapEvent
from common.test_utils import make_user
from customer_management.customer_analytics.models import AnalyticsEvent
from nfc_cards.models import NfcCard
from orders.models import Order, OrderItem, OrderRecipient, Transaction
from profiles.models import Profile

DESTINATION = "https://search.google.com/local/writereview?placeid=ChIJ_Test123"


class GoogleReviewFeatureTests(APITestCase):
    def setUp(self):
        self.owner = make_user(email="review-owner@example.com")
        self.buyer = make_user(email="review-buyer@example.com")
        self.other = make_user(email="review-other@example.com")
        self.admin = make_user(email="review-admin@example.com", role=User.Role.ADMIN, is_staff=True)
        self.profile = Profile.ensure_for_user(self.owner)
        self.client.force_authenticate(self.owner)

    def allocation(self, card_type="REVIEW", *, paid=True, ledger=True, user=None):
        user = user or self.owner
        order = Order.objects.create(customer=self.buyer, amount="100.00", payment_method="RAZORPAY",
                                     payment_status="PAID" if paid else "PENDING", shipping_line1="Example street",
                                     shipping_city="Hyderabad", shipping_state="Telangana", shipping_pincode="500001")
        OrderItem.objects.create(order=order, product_id=f"TEST-{card_type}", name="Test card", card_type=card_type,
                                 color="Black", qty=1, price="100.00")
        slot = OrderRecipient.objects.create(order=order, user=user, profile=Profile.ensure_for_user(user),
                                              name=user.full_name, email=user.email, card_type=card_type)
        if ledger:
            Transaction.objects.create(order=order, amount="100.00", method="RAZORPAY", status="PAID" if paid else "PENDING")
        return order, slot

    def card(self, card_type="REVIEW", *, owner=None, status="UNASSIGNED"):
        suffix = NfcCard.objects.count() + 1
        return NfcCard.objects.create(uid=f"GOOGLE-{suffix}", serial_number=f"GOOGLE-SN-{suffix}",
                                      card_type=card_type, user=owner, status=status)

    def test_paid_recipient_can_save_and_reload_without_acquiring_digital_access(self):
        self.allocation()
        response = self.client.patch(reverse("customer-google-review"),
                                     {"business_name": "Example Studio", "google_review_url": DESTINATION}, format="json")
        self.assertEqual(response.status_code, 200, response.data)
        data = self.client.get(reverse("customer-google-review")).data["data"]
        self.assertTrue(data["eligible"])
        self.assertTrue(data["configured"])
        self.assertFalse(data["digital_access"])
        self.assertEqual((data["business_name"], data["google_review_url"]), ("Example Studio", DESTINATION))
        self.profile.refresh_from_db()
        self.assertEqual(self.profile.selected_template, "classic")

    def test_purchaser_without_a_review_allocation_is_ineligible(self):
        self.allocation()
        self.client.force_authenticate(self.buyer)
        data = self.client.get(reverse("customer-google-review")).data["data"]
        self.assertFalse(data["eligible"])
        self.assertEqual(data["cards"], [])
        self.assertEqual(self.client.patch(reverse("customer-google-review"), {"google_review_url": DESTINATION}, format="json").status_code, 403)

    def test_unpaid_recipient_is_ineligible_and_legacy_profile_write_cannot_bypass(self):
        self.allocation(paid=False)
        self.assertFalse(self.client.get(reverse("customer-google-review")).data["data"]["eligible"])
        response = self.client.put(reverse("customer-profile"), {"google_review_url": DESTINATION}, format="json")
        self.assertEqual(response.status_code, 403, response.data)
        self.profile.refresh_from_db()
        self.assertEqual(self.profile.google_review_url, "")

    def test_paid_flag_without_a_successful_ledger_does_not_grant_review_settings(self):
        self.allocation(paid=True, ledger=False)
        self.assertFalse(self.client.get(reverse("customer-google-review")).data["data"]["eligible"])
        response = self.client.patch(reverse("customer-google-review"), {"google_review_url": DESTINATION}, format="json")
        self.assertEqual(response.status_code, 403)

    def test_settings_are_owner_scoped_and_unsafe_url_does_not_mutate(self):
        self.allocation()
        response = self.client.patch(reverse("customer-google-review"),
                                     {"business_name": "Should not save", "google_review_url": "https://evil.example/review"}, format="json")
        self.assertEqual(response.status_code, 400)
        self.profile.refresh_from_db()
        self.assertEqual(self.profile.google_review_business_name, "")
        self.client.force_authenticate(self.other)
        self.assertFalse(self.client.get(reverse("customer-google-review")).data["data"]["eligible"])

    def test_unencoded_short_link_query_returns_validation_error_without_mutating_settings(self):
        self.allocation()
        self.profile.google_review_url = DESTINATION
        self.profile.google_review_business_name = "Existing Business"
        self.profile.save(update_fields=["google_review_url", "google_review_business_name"])
        with patch("nfc_cards.review_urls._public_dns", return_value="142.250.1.1"), \
                patch("nfc_cards.review_urls._PinnedHTTPSConnection.connect") as connect:
            response = self.client.patch(reverse("customer-google-review"), {
                "business_name": "Must not save",
                "google_review_url": "https://g.page/r/business/review?source=\u0928\u092e\u0938\u094d\u0924\u0947",
            }, format="json")
        self.assertEqual(response.status_code, 400, response.data)
        connect.assert_not_called()
        self.profile.refresh_from_db()
        self.assertEqual((self.profile.google_review_url, self.profile.google_review_business_name),
                         (DESTINATION, "Existing Business"))

    def test_both_products_preserve_existing_digital_template_and_settings(self):
        self.allocation("REVIEW")
        self.allocation("CUSTOM")
        self.profile.selected_template = "future"
        self.profile.company = "Digital company"
        self.profile.save(update_fields=["selected_template", "company"])
        response = self.client.patch(reverse("customer-google-review"), {"business_name": "Review business", "google_review_url": DESTINATION}, format="json")
        self.assertTrue(response.data["data"]["digital_access"])
        self.profile.refresh_from_db()
        self.assertEqual((self.profile.selected_template, self.profile.company), ("future", "Digital company"))

    def test_review_only_configuration_does_not_require_digital_profile_completion(self):
        self.allocation()
        card = self.card(owner=self.owner, status="ACTIVE")
        self.client.patch(reverse("customer-google-review"), {"google_review_url": DESTINATION}, format="json")
        response = self.client.get(reverse("nfc-cards-resolve", args=[card.uid]))
        self.assertEqual(response.status_code, 200, response.data)
        self.assertEqual(response.data["data"]["redirect_url"], DESTINATION)

    def test_only_active_configured_review_cards_resolve(self):
        card = self.card(owner=self.owner, status="ACTIVE")
        for status in ("UNASSIGNED", "ASSIGNED", "INACTIVE", "BLOCKED", "LOST"):
            card.status = status
            card.save(update_fields=["status"])
            self.assertEqual(self.client.get(reverse("nfc-cards-resolve", args=[card.uid])).status_code, 404)
        card.status = "ACTIVE"
        card.save(update_fields=["status"])
        self.assertEqual(self.client.get(reverse("nfc-cards-resolve", args=[card.uid])).status_code, 404)
        self.profile.google_review_url = "https://evil.example"
        self.profile.save(update_fields=["google_review_url"])
        self.assertEqual(self.client.get(reverse("nfc-cards-resolve", args=[card.uid])).status_code, 404)
        self.assertEqual(TapEvent.objects.count(), 0)

    def test_review_tap_and_qr_are_separate_deduplicated_and_not_digital_events(self):
        card = self.card(owner=self.owner, status="ACTIVE")
        self.profile.google_review_url = DESTINATION
        self.profile.save(update_fields=["google_review_url"])
        url = reverse("nfc-cards-resolve", args=[card.uid])
        self.client.force_authenticate(None)
        for _ in range(2):
            self.assertEqual(self.client.get(url).status_code, 200)
            self.assertEqual(self.client.get(url, {"source": "qr"}).status_code, 200)
        self.assertEqual(TapEvent.objects.filter(action="REVIEW_TAP").count(), 1)
        self.assertEqual(TapEvent.objects.filter(action="REVIEW_QR_SCAN").count(), 1)
        self.assertEqual(AnalyticsEvent.objects.count(), 0)
        self.client.force_authenticate(self.owner)
        data = self.client.get(reverse("customer-google-review")).data["data"]
        self.assertEqual(data["stats"], {"taps": 1, "qr_scans": 1, "total": 2})
        self.assertTrue(data["qr_url"].endswith(f"/nfc/{card.uid}?source=qr"))

    def test_existing_digital_resolve_contract_and_metrics_remain(self):
        card = self.card("CUSTOM", owner=self.owner, status="ASSIGNED")
        response = self.client.get(reverse("nfc-cards-resolve", args=[card.uid]))
        self.assertEqual(response.data["data"]["redirect_url"], self.profile.public_url_path)
        self.assertEqual(TapEvent.objects.filter(action="TAP").count(), 1)
        self.assertEqual(AnalyticsEvent.objects.filter(event_type="NFC_TAP").count(), 1)

    def test_disabled_and_pending_review_owners_do_not_resolve(self):
        card = self.card(owner=self.owner, status="ACTIVE")
        self.profile.google_review_url = DESTINATION
        self.profile.save(update_fields=["google_review_url"])
        self.owner.is_active = False
        self.owner.save(update_fields=["is_active"])
        self.assertEqual(self.client.get(reverse("nfc-cards-resolve", args=[card.uid])).status_code, 404)
        self.owner.is_active = True
        self.owner.must_change_password = True
        self.owner.save(update_fields=["is_active", "must_change_password"])
        self.assertEqual(self.client.get(reverse("nfc-cards-resolve", args=[card.uid])).status_code, 404)
        self.assertEqual(TapEvent.objects.count(), 0)

    def test_digital_and_review_assignments_can_share_email_but_type_must_match(self):
        review_order, review_slot = self.allocation("REVIEW")
        digital_order, digital_slot = self.allocation("CUSTOM")
        review = self.card("REVIEW")
        digital = self.card("CUSTOM")
        self.client.force_authenticate(self.admin)
        mismatch = self.client.post(reverse("admin-order-assign-card", args=[review_order.pk]),
                                    {"card_id": digital.pk, "recipient_id": review_slot.pk}, format="json")
        self.assertEqual(mismatch.status_code, 400)
        for card, slot in ((review, review_slot), (digital, digital_slot)):
            response = self.client.post(reverse("admin-card-assign", args=[card.pk]),
                                        {"email": self.owner.email, "recipient_id": slot.pk}, format="json")
            self.assertEqual(response.status_code, 200, response.data)
            card.refresh_from_db()
            slot.refresh_from_db()
            self.assertEqual(card.user_id, self.owner.pk)
            self.assertEqual(slot.assigned_card_id, card.pk)

    def test_picker_and_manual_creation_require_matching_paid_slot(self):
        self.client.force_authenticate(self.admin)
        response = self.client.post(reverse("admin-cards"), {"card_type": "REVIEW", "customer_email": self.owner.email}, format="json")
        self.assertEqual(response.status_code, 400)
        self.assertEqual(NfcCard.objects.count(), 0)
        order, slot = self.allocation()
        picker = self.client.get(reverse("admin-card-assignment-customers"), {"card_type": "REVIEW"})
        self.assertEqual(picker.data["data"][0]["recipient_id"], slot.pk)
        response = self.client.post(reverse("admin-cards"), {"card_type": "REVIEW", "customer_email": self.owner.email, "recipient_id": slot.pk}, format="json")
        self.assertEqual(response.status_code, 201, response.data)
        slot.refresh_from_db()
        self.assertIsNotNone(slot.assigned_card_id)

    def test_owned_card_cannot_change_product_and_legacy_same_owner_edits_still_work(self):
        card = self.card("CUSTOM", owner=self.owner, status="ACTIVE")
        self.client.force_authenticate(self.admin)
        url = reverse("admin-card-detail", args=[card.pk])
        response = self.client.patch(url, {"card_type": "REVIEW"}, format="json")
        self.assertEqual(response.status_code, 400)
        response = self.client.patch(url, {"customer_email": self.owner.email, "notes": "Existing metadata"}, format="json")
        self.assertEqual(response.status_code, 200, response.data)
        card.refresh_from_db()
        self.assertEqual((card.card_type, card.notes), ("CUSTOM", "Existing metadata"))

    def test_new_uid_claim_requires_paid_slot_while_existing_owner_can_activate(self):
        review = self.card()
        response = self.client.post(reverse("nfc-activate"), {"uid": review.uid}, format="json")
        self.assertEqual(response.status_code, 400)
        self.allocation()
        response = self.client.post(reverse("nfc-activate"), {"uid": review.uid}, format="json")
        self.assertEqual(response.status_code, 200, response.data)
        self.assertEqual(response.data["data"]["status"], "ACTIVE")

    def test_existing_digital_uid_claim_does_not_require_a_new_paid_allocation(self):
        digital = self.card("CUSTOM")
        response = self.client.post(reverse("nfc-activate"), {"uid": digital.uid}, format="json")
        self.assertEqual(response.status_code, 200, response.data)
        digital.refresh_from_db()
        self.assertEqual((digital.user_id, digital.status), (self.owner.pk, "ACTIVE"))
        self.assertFalse(OrderRecipient.objects.filter(user=self.owner).exists())

    def test_review_email_copy_does_not_offer_digital_design_or_reset_existing_password(self):
        order, _ = self.allocation()
        before = self.owner.password
        onboarding.ensure_recipient_accounts(order)
        html, text = onboarding._render_card_ready(self.owner, order)
        self.assertIn("Google Review workspace", text)
        self.assertNotIn("digital business profile", text)
        self.assertNotIn("designer", html)
        self.assertIn("select Activate card", text)
        _, activation_text = onboarding._render_activation(self.owner, "offline-token", order)
        self.assertIn("select Activate card", activation_text)
        self.owner.refresh_from_db()
        self.assertEqual(self.owner.password, before)
        self.assertEqual(User.objects.filter(email=self.owner.email).count(), 1)

    def test_anonymous_cannot_read_review_workspace(self):
        self.client.force_authenticate(None)
        self.assertEqual(self.client.get(reverse("customer-google-review")).status_code, 401)

    def test_review_inventory_uid_is_valid_for_a_stable_public_route(self):
        self.client.force_authenticate(self.admin)
        for uid in ("WITH/SLASH", "..", "QUERY?VALUE", "HASH#VALUE"):
            with self.subTest(uid=uid):
                response = self.client.post(reverse("admin-cards"), {"card_type": "REVIEW", "uid": uid}, format="json")
                self.assertEqual(response.status_code, 400, response.data)
        self.assertEqual(NfcCard.objects.count(), 0)

    def test_workspace_unsupported_methods_do_not_modify_the_owners_settings(self):
        self.allocation()
        url = reverse("customer-google-review")
        for method in (self.client.post, self.client.put, self.client.delete):
            with self.subTest(method=method.__name__):
                response = method(url, {"google_review_url": DESTINATION, "business_name": "Must not save"}, format="json")
                self.assertEqual(response.status_code, 405, response.data)
        self.profile.refresh_from_db()
        self.assertEqual((self.profile.google_review_url, self.profile.google_review_business_name), ("", ""))

    @override_settings(FRONTEND_URL="https://gateway.example/")
    def test_admin_and_owner_get_the_same_programming_url_before_activation_and_configuration(self):
        self.allocation()
        card = self.card(owner=self.owner, status="ASSIGNED")
        expected = f"https://gateway.example/nfc/{card.uid}"
        workspace = self.client.get(reverse("customer-google-review")).data["data"]
        self.assertFalse(workspace["configured"])
        self.assertEqual(workspace["scan_url"], expected)
        self.assertEqual(workspace["qr_url"], expected + "?source=qr")
        self.assertEqual(workspace["cards"][0]["programming_url"], expected)
        owned_cards = self.client.get(reverse("nfc-cards-mine")).data["data"]
        self.assertEqual(owned_cards[0]["programming_url"], expected)
        self.client.force_authenticate(self.admin)
        admin_cards = self.client.get(reverse("admin-cards")).data["data"]
        self.assertEqual(admin_cards[0]["programming_url"], expected)
        self.assertNotIn(self.owner.email, expected)
        self.assertNotIn("token", expected)
        self.client.force_authenticate(self.buyer)
        self.assertEqual(self.client.get(reverse("customer-google-review")).data["data"]["cards"], [])
        self.assertEqual(self.client.get(reverse("admin-cards")).status_code, 403)

    def test_editing_review_destination_keeps_programming_url_and_resolves_the_latest_value(self):
        self.allocation()
        card = self.card(owner=self.owner, status="ACTIVE")
        workspace_url = reverse("customer-google-review")
        stable = self.client.get(workspace_url).data["data"]["scan_url"]
        public_url = reverse("nfc-cards-resolve", args=[card.uid])
        for destination in (DESTINATION, DESTINATION.replace("ChIJ_Test123", "ChIJ_Updated123")):
            saved = self.client.patch(workspace_url, {
                "business_name": "Updated Business", "google_review_url": destination,
                "programming_url": "https://evil.example/ignored",
            }, format="json")
            self.assertEqual(saved.status_code, 200, saved.data)
            self.assertEqual(saved.data["data"]["scan_url"], stable)
            self.assertEqual(saved.data["data"]["cards"][0]["programming_url"], stable)
            self.client.force_authenticate(None)
            resolved = self.client.get(public_url)
            self.assertEqual(resolved.status_code, 200, resolved.data)
            self.assertEqual(resolved.data["data"], {"redirect_url": destination})
            self.client.force_authenticate(self.owner)

    def test_programming_link_does_not_bypass_physical_activation_or_destination_validation(self):
        card = self.card(owner=self.owner, status="ASSIGNED")
        stable = card.programming_url
        self.assertIsNotNone(stable)
        url = reverse("nfc-cards-resolve", args=[card.uid])
        self.client.force_authenticate(None)
        self.assertEqual(self.client.get(url).status_code, 404)
        card.status = "ACTIVE"
        card.save(update_fields=["status"])
        self.assertEqual(card.programming_url, stable)
        self.assertEqual(self.client.get(url).status_code, 404)
        self.profile.google_review_url = "https://evil.example/"
        self.profile.save(update_fields=["google_review_url"])
        self.assertEqual(self.client.get(url).status_code, 404)
        self.assertEqual(TapEvent.objects.count(), 0)

    def test_programming_url_is_not_exposed_for_unassigned_or_digital_inventory(self):
        unowned = self.card()
        digital = self.card("CUSTOM", owner=self.owner, status="ACTIVE")
        self.assertIsNone(unowned.programming_url)
        self.assertIsNone(digital.programming_url)
