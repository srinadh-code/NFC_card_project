"""Permanent public routing tokens reuse NFC lookup without issuing credentials."""
from unittest.mock import patch
from urllib.parse import unquote, urlsplit

from django.core import signing
from django.test import SimpleTestCase, override_settings
from django.urls import reverse
from rest_framework.test import APITestCase

from accounts.models import User
from analytics.models import TapEvent
from common.test_utils import make_user
from nfc_cards.models import NfcCard, review_uid_from_identifier
from orders.models import Order, OrderItem, OrderRecipient, Transaction
from profiles.models import Profile


PUBLIC_ORIGIN = "https://nfc-card-project-peach.vercel.app"
DESTINATION = "https://search.google.com/local/writereview?placeid=ChIJ_TokenBusiness"
PUBLIC_SALT = "nfc_cards.review.public.v1"


def public_identifier(card):
    return unquote(urlsplit(card.programming_url).path.removeprefix("/nfc/"))


def signed_uid(uid, *, salt=PUBLIC_SALT):
    return signing.Signer(salt=salt, sep=".", algorithm="sha256").sign(uid)


@override_settings(PUBLIC_NFC_BASE_URL=PUBLIC_ORIGIN)
class ReviewProgrammingTokenTests(SimpleTestCase):
    def card(self, **kwargs):
        return NfcCard(uid=kwargs.pop("uid", "PUBLIC-REVIEW_1"), serial_number="PUBLIC-TOKEN-SN",
                       card_type=kwargs.pop("card_type", "REVIEW"), user_id=kwargs.pop("user_id", 7),
                       status=kwargs.pop("status", "ASSIGNED"), **kwargs)

    def test_public_identifier_has_purpose_bound_signature_of_only_the_existing_uid(self):
        card = self.card()
        identifier = public_identifier(card)
        self.assertGreater(len(identifier), NfcCard._meta.get_field("uid").max_length)
        self.assertRegex(identifier, r"^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]{43}$")
        self.assertEqual(signing.Signer(salt=PUBLIC_SALT, sep=".", algorithm="sha256").unsign(identifier), card.uid)
        self.assertEqual(review_uid_from_identifier(identifier), card.uid)
        self.assertNotIn("token=", card.programming_url)
        self.assertNotIn("customer", identifier)

    def test_distinct_uids_have_distinct_tokens_while_repeated_reads_are_deterministic(self):
        first, second = self.card(uid="REVIEW-1"), self.card(uid="REVIEW-2")
        self.assertNotEqual(first.programming_url, second.programming_url)
        self.assertEqual(first.programming_url, self.card(uid=first.uid).programming_url)
        self.assertEqual(review_uid_from_identifier(public_identifier(second)), second.uid)

    def test_token_does_not_expire_or_change_with_time_account_or_card_status(self):
        with patch("django.core.signing.time.time", return_value=0):
            original = self.card().programming_url
        with patch("django.core.signing.time.time", return_value=10_000_000_000):
            changed = self.card(user_id=999, status="ACTIVE").programming_url
            self.assertEqual(changed, original)
            self.assertEqual(review_uid_from_identifier(public_identifier(self.card())), "PUBLIC-REVIEW_1")

    def test_tampering_wrong_purpose_and_unsigned_identifiers_are_rejected(self):
        token = public_identifier(self.card())
        uid, signature = token.rsplit(".", 1)
        changed_signature = ("A" if signature[0] != "A" else "B") + signature[1:]
        for invalid in (
            f"DIFFERENT.{signature}", f"{uid}.{changed_signature}", token[:-1], uid,
            signed_uid(uid, salt="accounts.activation"), "x" * 500,
        ):
            with self.subTest(identifier=invalid):
                self.assertIsNone(review_uid_from_identifier(invalid))

    def test_explicit_signing_key_fallback_preserves_existing_printed_tokens(self):
        old_key, new_key = "offline-old-public-routing-key", "offline-new-public-routing-key"
        with override_settings(SECRET_KEY=old_key, SECRET_KEY_FALLBACKS=[]):
            old_token = public_identifier(self.card())
        with override_settings(SECRET_KEY=new_key, SECRET_KEY_FALLBACKS=[old_key]):
            self.assertEqual(review_uid_from_identifier(old_token), "PUBLIC-REVIEW_1")
        with override_settings(SECRET_KEY=new_key, SECRET_KEY_FALLBACKS=[]):
            self.assertIsNone(review_uid_from_identifier(old_token))

    def test_digital_and_unassigned_inventory_get_no_review_programming_url(self):
        for card in (self.card(card_type="CUSTOM"), self.card(card_type="WOODEN"),
                     self.card(user_id=None), self.card(status="UNASSIGNED")):
            self.assertIsNone(card.programming_url)


@override_settings(PUBLIC_NFC_BASE_URL=PUBLIC_ORIGIN,
                   PASSWORD_HASHERS=["django.contrib.auth.hashers.MD5PasswordHasher"])
class ReviewProgrammingTokenFlowTests(APITestCase):
    def setUp(self):
        self.owner = make_user("public-token-owner@example.com")
        self.admin = make_user("public-token-admin@example.com", role=User.Role.ADMIN, is_staff=True)
        self.profile = Profile.ensure_for_user(self.owner)
        self.profile.google_review_url = DESTINATION
        self.profile.save(update_fields=["google_review_url"])

    def card(self, **kwargs):
        number = NfcCard.objects.count() + 1
        return NfcCard.objects.create(uid=kwargs.pop("uid", f"PUBLIC-REVIEW-{number}"),
                                      serial_number=f"PUBLIC-SN-{number}", card_type=kwargs.pop("card_type", "REVIEW"),
                                      user=kwargs.pop("user", self.owner), status=kwargs.pop("status", "ACTIVE"), **kwargs)

    def resolve(self, identifier, **query):
        return self.client.get(reverse("nfc-cards-resolve", args=[identifier]), query)

    def test_anonymous_signed_redirect_reuses_review_analytics_and_legacy_raw_route(self):
        card = self.card()
        token = public_identifier(card)
        for identifier in (token, card.uid):
            response = self.resolve(identifier)
            self.assertEqual(response.status_code, 200, response.data)
            self.assertEqual(response.data["data"], {"redirect_url": DESTINATION})
        self.assertEqual(TapEvent.objects.filter(card=card, action="REVIEW_TAP").count(), 1)
        self.assertEqual(self.resolve(token, source="qr").status_code, 200)
        self.assertEqual(TapEvent.objects.filter(card=card, action="REVIEW_QR_SCAN").count(), 1)

    def test_invalid_or_unknown_signed_identifiers_do_not_resolve_or_record_events(self):
        card = self.card()
        token = public_identifier(card)
        for identifier in (token[:-1], signed_uid("UNKNOWN-REVIEW"), signed_uid(card.uid, salt="accounts.activation"), "x" * 200):
            with self.subTest(identifier=identifier):
                self.assertEqual(self.resolve(identifier).status_code, 404)
        self.assertEqual(TapEvent.objects.count(), 0)

    def test_signed_digital_uid_is_rejected_while_raw_digital_uids_and_numeric_alias_work(self):
        card = self.card(card_type="CUSTOM", uid="DIGITAL.V1")
        self.assertEqual(self.resolve(signed_uid(card.uid)).status_code, 404)
        for identifier in (card.uid, str(card.pk)):
            response = self.resolve(identifier)
            self.assertEqual(response.status_code, 200, response.data)
            self.assertEqual(response.data["data"]["redirect_url"], self.profile.public_url_path)
        self.assertEqual(TapEvent.objects.filter(action="REVIEW_TAP").count(), 0)

    def test_programming_url_reads_do_not_write_or_query_the_database(self):
        card = self.card()
        stored_before = NfcCard.objects.values().get(pk=card.pk)
        with self.assertNumQueries(0):
            first, second = card.programming_url, card.programming_url
            self.assertEqual(review_uid_from_identifier(public_identifier(card)), card.uid)
        self.assertEqual(first, second)
        self.assertEqual(NfcCard.objects.values().get(pk=card.pk), stored_before)

    def test_customer_and_admin_receive_one_identical_canonical_url(self):
        card = self.card()
        expected = card.programming_url
        self.client.force_authenticate(self.owner)
        workspace = self.client.get(reverse("customer-google-review")).data["data"]
        self.assertEqual(workspace["scan_url"], expected)
        self.assertEqual(workspace["cards"][0]["programming_url"], expected)
        owned = self.client.get(reverse("nfc-cards-mine")).data["data"]
        self.assertEqual(owned[0]["programming_url"], expected)
        self.client.force_authenticate(self.admin)
        inventory = self.client.get(reverse("admin-cards")).data["data"]
        self.assertEqual(inventory[0]["programming_url"], expected)

    def test_business_and_destination_edits_keep_url_and_anonymous_taps_use_latest_destination(self):
        card = self.card()
        stable = card.programming_url
        self.client.force_authenticate(self.owner)
        replacement = DESTINATION.replace("ChIJ_TokenBusiness", "ChIJ_UpdatedBusiness")
        response = self.client.patch(reverse("customer-google-review"),
                                     {"business_name": "Updated Business", "google_review_url": replacement}, format="json")
        self.assertEqual(response.status_code, 200, response.data)
        self.assertEqual(response.data["data"]["scan_url"], stable)
        self.owner.full_name = "Updated Owner Name"
        self.owner.save(update_fields=["full_name"])
        card.refresh_from_db()
        self.assertEqual(card.programming_url, stable)
        self.client.force_authenticate(None)
        resolved = self.resolve(public_identifier(card))
        self.assertEqual(resolved.status_code, 200, resolved.data)
        self.assertEqual(resolved.data["data"]["redirect_url"], replacement)

    def test_assigned_card_has_stable_link_but_redirect_waits_for_physical_activation(self):
        card = self.card(status="ASSIGNED")
        stable = card.programming_url
        self.assertEqual(self.resolve(public_identifier(card)).status_code, 404)
        self.client.force_authenticate(self.owner)
        activated = self.client.post(reverse("nfc-cards-activate-assigned", args=[card.pk]))
        self.assertEqual(activated.status_code, 200, activated.data)
        self.assertEqual(activated.data["data"]["programming_url"], stable)
        self.client.force_authenticate(None)
        self.assertEqual(self.resolve(public_identifier(card)).status_code, 200)

    def test_signed_link_preserves_disabled_owner_and_blocked_card_protections(self):
        card = self.card()
        identifier = public_identifier(card)
        for status in ("ASSIGNED", "UNASSIGNED", "INACTIVE", "BLOCKED", "LOST"):
            with self.subTest(status=status):
                NfcCard.objects.filter(pk=card.pk).update(status=status)
                self.assertEqual(self.resolve(identifier).status_code, 404)
        NfcCard.objects.filter(pk=card.pk).update(status="ACTIVE")
        self.owner.is_active = False
        self.owner.save(update_fields=["is_active"])
        self.assertEqual(self.resolve(identifier).status_code, 404)
        self.owner.is_active, self.owner.must_change_password = True, True
        self.owner.save(update_fields=["is_active", "must_change_password"])
        self.assertEqual(self.resolve(identifier).status_code, 404)
        self.assertEqual(TapEvent.objects.count(), 0)

    def test_saving_paid_allocation_without_physical_assignment_does_not_create_card_or_link(self):
        order = Order.objects.create(customer=self.owner, amount="100.00", payment_method="RAZORPAY", payment_status="PAID")
        OrderItem.objects.create(order=order, product_id="REVIEW", name="Review", card_type="REVIEW", color="Black", qty=1, price="100.00")
        Transaction.objects.create(order=order, amount="100.00", method="RAZORPAY", status="PAID")
        OrderRecipient.objects.create(order=order, user=self.owner, profile=self.profile, name=self.owner.full_name,
                                      email=self.owner.email, card_type="REVIEW")
        self.client.force_authenticate(self.owner)
        response = self.client.patch(reverse("customer-google-review"),
                                     {"business_name": "Awaiting card", "google_review_url": DESTINATION}, format="json")
        self.assertEqual(response.status_code, 200, response.data)
        self.assertTrue(response.data["data"]["configured"])
        self.assertEqual(response.data["data"]["scan_url"], "")
        self.assertEqual(response.data["data"]["cards"], [])
        self.assertEqual(NfcCard.objects.count(), 0)
