"""Malformed API input must be rejected before logs or partial mutations."""

from types import SimpleNamespace

from django.core.cache import cache
from django.urls import reverse
from rest_framework.test import APITestCase

from common.test_utils import AuthenticatedAPITestCase, make_user
from customer_management.customer_leads.models import Lead
from customer_management.customer_leads.views import LeadSubmitThrottle
from customer_management.customer_services.models import CustomerService
from profiles.models import CustomField, CustomLink, Profile, SocialLink


class PublicInputShapeSecurityTests(APITestCase):
    def setUp(self):
        cache.clear()
        self.addCleanup(cache.clear)

    def test_login_rejects_non_object_json(self):
        for body in ([], ["email"], "invalid", 123, True):
            with self.subTest(body=body):
                response = self.client.post(reverse("auth-login"), body, format="json")
                self.assertEqual(response.status_code, 400, response.content)
                self.assertFalse(response.data["success"])

    def test_failed_login_does_not_log_submitted_email_or_password(self):
        email = "private-login@example.com"
        password = "SensitiveInput123!"
        with self.assertLogs("accounts.auth", level="INFO") as logged:
            response = self.client.post(
                reverse("auth-login"), {"email": email, "password": password}, format="json"
            )
        self.assertEqual(response.status_code, 400)
        output = "\n".join(logged.output)
        self.assertIn("auth.login.failed", output)
        self.assertNotIn(email, output)
        self.assertNotIn(password, output)

    def test_valid_login_keeps_existing_token_response(self):
        user = make_user(email="shape-login@example.com", password="ValidLogin123!")
        response = self.client.post(
            reverse("auth-login"), {"email": user.email, "password": "ValidLogin123!"}, format="json"
        )
        self.assertEqual(response.status_code, 200, response.content)
        payload = response.data["data"]
        self.assertEqual(payload["user"]["id"], user.pk)
        self.assertTrue(payload["access"])
        self.assertTrue(payload["refresh"])

    def test_public_leads_reject_malformed_json_without_creating_rows(self):
        for body in ([], ["username"], "invalid", 123, True, {"username": {}}, {"username": []}):
            with self.subTest(body=body):
                response = self.client.post(reverse("customer-leads"), body, format="json")
                self.assertEqual(response.status_code, 400, response.content)
        self.assertEqual(Lead.objects.count(), 0)

    def test_lead_throttle_ignores_invalid_or_missing_identifiers(self):
        throttle = LeadSubmitThrottle()
        for body in ([], 123, None, {}, {"username": None}, {"username": True}, {"username": []}, {"username": {}}, {"username": "invalid slug"}):
            with self.subTest(body=body):
                self.assertIsNone(throttle.get_cache_key(SimpleNamespace(data=body), None))
        self.assertEqual(
            throttle.get_cache_key(SimpleNamespace(data={"username": "  Example-Profile  "}), None),
            throttle.cache_format % {"scope": "lead_submit", "ident": "example-profile"},
        )
        numeric_key = throttle.cache_format % {"scope": "lead_submit", "ident": "123"}
        for value in (123, "123"):
            with self.subTest(value=value):
                self.assertEqual(throttle.get_cache_key(SimpleNamespace(data={"username": value}), None), numeric_key)

    def test_numeric_and_string_usernames_share_the_public_submission_budget(self):
        user = make_user(email="numeric-profile@example.com")
        Profile.objects.create(user=user, username="123", profile_public=True)
        payload = {
            "name": "Visitor",
            "email": "visitor@example.com",
            "phone": "+91 98765 43210",
            "message": "Please contact me.",
        }
        for index in range(10):
            response = self.client.post(reverse("customer-leads"), {
                **payload, "username": 123 if index % 2 == 0 else "123",
            }, format="json")
            self.assertEqual(response.status_code, 201 if index == 0 else 200, response.content)
        for username in (123, "123"):
            response = self.client.post(reverse("customer-leads"), {
                **payload, "username": username,
            }, format="json")
            self.assertEqual(response.status_code, 429, response.content)
        self.assertEqual(Lead.objects.filter(user=user).count(), 1)


class OwnedInputShapeSecurityTests(AuthenticatedAPITestCase):
    def setUp(self):
        super().setUp()
        own_profile = Profile.ensure_for_user(self.user)
        other_profile = Profile.ensure_for_user(self.other_user)
        social = list(SocialLink.objects.filter(profile=own_profile).order_by("pk")[:2])
        foreign_social = SocialLink.objects.filter(profile=other_profile).order_by("pk").first()
        self.reorder_cases = [
            ("social-link-reorder", social[0], social[1], foreign_social),
            (
                "custom-link-reorder",
                CustomLink.objects.create(profile=own_profile, label="Own A", url="https://example.com/a"),
                CustomLink.objects.create(profile=own_profile, label="Own B", url="https://example.com/b"),
                CustomLink.objects.create(profile=other_profile, label="Foreign", url="https://example.com/private"),
            ),
            (
                "custom-field-reorder",
                CustomField.objects.create(profile=own_profile, label="Own A", value="first"),
                CustomField.objects.create(profile=own_profile, label="Own B", value="second"),
                CustomField.objects.create(profile=other_profile, label="Foreign", value="private"),
            ),
            (
                "customer-services-reorder",
                CustomerService.objects.create(user=self.user, title="Own A"),
                CustomerService.objects.create(user=self.user, title="Own B"),
                CustomerService.objects.create(user=self.other_user, title="Foreign"),
            ),
        ]
        for _, first, second, foreign in self.reorder_cases:
            for row, order in ((first, 4), (second, 7), (foreign, 9)):
                row.display_order = order
                row.save(update_fields=["display_order"])

    def _assert_orders(self, rows, expected):
        for row in rows:
            row.refresh_from_db()
        self.assertEqual(tuple(row.display_order for row in rows), expected)

    def test_profile_reorders_reject_malformed_batches_before_any_write(self):
        self._check_malformed_reorders(self.reorder_cases[:3])

    def test_service_reorder_rejects_malformed_batches_before_any_write(self):
        self._check_malformed_reorders(self.reorder_cases[3:])

    def _check_malformed_reorders(self, cases):
        for route, first, second, foreign in cases:
            bodies = (
                [], 123, "invalid", {"order": None}, {"order": 123}, {"order": "12"},
                {"order": {}}, {"order": [first.pk, {}]}, {"order": [first.pk, []]},
                {"order": [first.pk, True]}, {"order": [first.pk, 1.5]},
                {"order": [first.pk, str(second.pk)]},
            )
            for body in bodies:
                with self.subTest(route=route, body=body):
                    response = self.client.patch(reverse(route), body, format="json")
                    self.assertEqual(response.status_code, 400, response.content)
                    self._assert_orders((first, second, foreign), (4, 7, 9))

    def test_valid_reorders_keep_foreign_ids_ignored_and_positions_unchanged(self):
        for route, first, second, foreign in self.reorder_cases:
            with self.subTest(route=route):
                response = self.client.patch(
                    reverse(route), {"order": [second.pk, foreign.pk, first.pk]}, format="json"
                )
                self.assertEqual(response.status_code, 200, response.content)
                self._assert_orders((first, second, foreign), (2, 0, 9))

    def test_empty_or_omitted_order_remains_an_accepted_noop(self):
        for route, first, second, foreign in self.reorder_cases:
            for body in ({}, {"order": []}):
                with self.subTest(route=route, body=body):
                    response = self.client.patch(reverse(route), body, format="json")
                    self.assertEqual(response.status_code, 200, response.content)
                    self._assert_orders((first, second, foreign), (4, 7, 9))

    def test_bulk_custom_fields_rejects_bad_body_without_deleting_existing_rows(self):
        first, second, foreign = self.reorder_cases[2][1:]
        for body in ([], ["fields"], 123, "invalid", {"fields": None}, {"fields": {}}, {"fields": "invalid"}):
            with self.subTest(body=body):
                response = self.client.put(reverse("custom-field-bulk"), body, format="json")
                self.assertEqual(response.status_code, 400, response.content)
                self._assert_orders((first, second, foreign), (4, 7, 9))
                self.assertEqual(CustomField.objects.filter(profile=first.profile).count(), 2)

    def test_bulk_custom_fields_validates_later_rows_before_updating_earlier_rows(self):
        first, second, foreign = self.reorder_cases[2][1:]
        response = self.client.put(reverse("custom-field-bulk"), {"fields": [
            {"id": first.pk, "label": "Must not change", "value": "updated"},
            {"id": second.pk, "label": "Incomplete", "value": ""},
        ]}, format="json")
        self.assertEqual(response.status_code, 400, response.content)
        self._assert_orders((first, second, foreign), (4, 7, 9))
        self.assertEqual((first.label, first.value), ("Own A", "first"))
        self.assertEqual(CustomField.objects.filter(profile=first.profile).count(), 2)
