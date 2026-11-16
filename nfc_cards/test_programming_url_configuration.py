"""A Review chip receives only a stable, public HTTPS application URL."""
from django.contrib import admin
from django.test import RequestFactory, SimpleTestCase, override_settings
from django.urls import reverse
from rest_framework.test import APITestCase

from accounts.models import User
from common.test_utils import make_user
from nfc_cards.admin import NfcCardAdmin
from nfc_cards.models import NfcCard


@override_settings(PUBLIC_NFC_BASE_URL="")
class ProgrammingUrlConfigurationTests(SimpleTestCase):
    def card(self, **kwargs):
        return NfcCard(uid="REVIEW-STABLE_123", serial_number="REVIEW-CONFIG", card_type="REVIEW",
                       user_id=7, status=kwargs.pop("status", "ASSIGNED"), **kwargs)

    def test_public_https_frontend_origin_and_trailing_slash_are_supported(self):
        for origin in ("https://cards.example.com", "https://cards.example.com/"):
            with self.subTest(origin=origin), override_settings(FRONTEND_URL=origin):
                self.assertEqual(self.card().programming_url, "https://cards.example.com/nfc/REVIEW-STABLE_123")

    def test_local_private_malformed_or_non_origin_configuration_exposes_no_programming_url(self):
        rejected = (
            "", "cards.example.com", "http://cards.example.com", "//cards.example.com",
            "http://localhost:5173", "https://localhost", "https://localhost.", "https://cards.localhost",
            "https://cards.local", "https://cards.internal", "https://cards.invalid",
            "https://127.0.0.1", "https://10.2.3.4", "https://192.168.1.1", "https://169.254.169.254",
            "https://0.0.0.0", "https://8.8.8.8", "https://2130706433", "https://0x7f000001",
            "https://[::1]", "https://[fc00::1]", "https://[2606:4700:4700::1111]",
            "https://person:password@cards.example.com", "https://cards.example.com/path",
            "https://cards.example.com?source=qr", "https://cards.example.com#fragment",
            "https://cards.example.com:443", "https://cards.example.com:8443",
            "https://cards.example.com\\@localhost", "https://cards.exa\nmple.com",
        )
        for origin in rejected:
            with self.subTest(origin=origin), override_settings(FRONTEND_URL=origin):
                self.assertIsNone(self.card().programming_url)

    @override_settings(FRONTEND_URL="http://localhost:5173", PUBLIC_NFC_BASE_URL="https://production.example.com/")
    def test_explicit_public_base_is_used_while_frontend_runs_locally(self):
        self.assertEqual(self.card().programming_url, "https://production.example.com/nfc/REVIEW-STABLE_123")

    @override_settings(FRONTEND_URL="https://frontend.example.com", PUBLIC_NFC_BASE_URL="http://localhost:5173")
    def test_invalid_explicit_base_fails_closed_instead_of_changing_the_chip_origin(self):
        self.assertIsNone(self.card().programming_url)

    @override_settings(FRONTEND_URL="http://localhost:5173")
    def test_development_and_production_never_expose_a_local_programming_url(self):
        for environment in ("development", "production"):
            with self.subTest(environment=environment), override_settings(DJANGO_ENV=environment):
                self.assertIsNone(self.card().programming_url)

    @override_settings(FRONTEND_URL="https://production.example.com")
    def test_existing_assigned_url_survives_activation_and_unavailable_card_states(self):
        urls = {self.card(status=status).programming_url for status in ("ASSIGNED", "ACTIVE", "INACTIVE", "BLOCKED", "LOST")}
        self.assertEqual(urls, {"https://production.example.com/nfc/REVIEW-STABLE_123"})


@override_settings(
    PUBLIC_NFC_BASE_URL="https://production.example.com", FRONTEND_URL="http://localhost:5173",
    PASSWORD_HASHERS=["django.contrib.auth.hashers.MD5PasswordHasher"],
)
class ReviewProgrammingUidTests(APITestCase):
    def setUp(self):
        self.owner = make_user("programming-owner@example.com")
        self.admin_user = make_user("programming-admin@example.com", role=User.Role.ADMIN, is_staff=True)
        self.client.force_authenticate(self.admin_user)

    def card(self, **kwargs):
        index = NfcCard.objects.count() + 1
        return NfcCard.objects.create(uid=f"IMMUTABLE-{index}", serial_number=f"IMMUTABLE-SN-{index}",
                                      card_type=kwargs.pop("card_type", "REVIEW"),
                                      user=kwargs.pop("user", self.owner), status=kwargs.pop("status", "ASSIGNED"), **kwargs)

    def test_admin_api_cannot_change_owned_review_uid_or_permanent_url(self):
        for status in ("ASSIGNED", "ACTIVE", "INACTIVE", "BLOCKED", "LOST"):
            with self.subTest(status=status):
                card = self.card(status=status)
                original_uid, original_url = card.uid, card.programming_url
                response = self.client.patch(reverse("admin-card-detail", args=[card.pk]), {"uid": "REPLACEMENT"}, format="json")
                self.assertEqual(response.status_code, 400, response.data)
                card.refresh_from_db()
                self.assertEqual((card.uid, card.programming_url), (original_uid, original_url))

    def test_same_uid_and_other_inventory_edits_preserve_owned_review_link(self):
        card = self.card()
        original_url = card.programming_url
        response = self.client.patch(reverse("admin-card-detail", args=[card.pk]),
                                     {"uid": card.uid, "notes": "Programming verified"}, format="json")
        self.assertEqual(response.status_code, 200, response.data)
        card.refresh_from_db()
        self.assertEqual(card.programming_url, original_url)
        self.assertEqual(card.notes, "Programming verified")

    def test_unassigned_review_and_existing_digital_inventory_uid_edits_remain_available(self):
        for card in (self.card(user=None, status="UNASSIGNED"), self.card(card_type="CUSTOM")):
            response = self.client.patch(reverse("admin-card-detail", args=[card.pk]),
                                         {"uid": f"EDITED-{card.pk}"}, format="json")
            self.assertEqual(response.status_code, 200, response.data)
            card.refresh_from_db()
            self.assertEqual(card.uid, f"EDITED-{card.pk}")

    def test_django_admin_excludes_owned_review_uid_from_edit_form(self):
        model_admin = NfcCardAdmin(NfcCard, admin.site)
        request = RequestFactory().get("/admin/nfc_cards/nfccard/")
        request.user = self.admin_user
        owned_review = self.card()
        owned_fields = model_admin.get_form(request, owned_review).base_fields
        self.assertNotIn("uid", owned_fields)
        self.assertNotIn("card_type", owned_fields)
        for card in (self.card(user=None, status="UNASSIGNED"), self.card(card_type="CUSTOM")):
            self.assertIn("uid", model_admin.get_form(request, card).base_fields)
