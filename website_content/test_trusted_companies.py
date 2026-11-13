"""Offline regressions for the existing trusted-companies CMS APIs."""

from django.urls import reverse
from rest_framework.test import APITestCase

from common.test_utils import make_user
from website_content.models import Company


class TrustedCompanyAPITests(APITestCase):
    def setUp(self):
        self.admin = make_user(email="company-admin@example.com", role="ADMIN")
        self.customer = make_user(email="company-customer@example.com")
        self.collection = reverse("admin-companies")
        self.public = reverse("public-companies")

    def _public_names(self, home=False):
        response = self.client.get(reverse("public-home") if home else self.public)
        self.assertEqual(response.status_code, 200)
        rows = response.data["data"]["companies"] if home else response.data["data"]
        return [row["name"] for row in rows]

    def test_admin_create_edit_disable_delete_refreshes_both_public_payloads(self):
        self.client.force_authenticate(self.admin)
        response = self.client.post(self.collection, {
            "name": "  Example Studio  ", "display_order": 2, "is_active": True,
        }, format="json")
        self.assertEqual(response.status_code, 201, response.data)
        company_id = response.data["data"]["id"]
        detail = reverse("admin-company-detail", args=[company_id])
        self.client.force_authenticate(None)
        self.assertEqual(self._public_names(), ["Example Studio"])
        self.assertEqual(self._public_names(home=True), ["Example Studio"])

        self.client.force_authenticate(self.admin)
        self.assertEqual(self.client.patch(detail, {"name": "Updated Studio"}, format="json").status_code, 200)
        self.client.force_authenticate(None)
        self.assertEqual(self._public_names(home=True), ["Updated Studio"])

        self.client.force_authenticate(self.admin)
        self.assertEqual(self.client.patch(detail, {"is_active": False}, format="json").status_code, 200)
        self.client.force_authenticate(None)
        self.assertEqual(self._public_names(), [])
        self.assertEqual(self._public_names(home=True), [])

        self.client.force_authenticate(self.admin)
        self.assertEqual(self.client.patch(detail, {"is_active": True}, format="json").status_code, 200)
        self.assertEqual(self.client.delete(detail).status_code, 200)
        self.assertFalse(Company.objects.filter(pk=company_id).exists())
        self.client.force_authenticate(None)
        self.assertEqual(self._public_names(home=True), [])

    def test_active_only_minimal_public_data_uses_stable_display_order(self):
        late = Company.objects.create(name="Later Studio", display_order=4, logo_public_id="private-provider-id", is_active=True)
        first = Company.objects.create(name="First Studio", display_order=0, is_active=True)
        tied = Company.objects.create(name="Second Studio", display_order=0, is_active=True)
        Company.objects.create(name="Inactive Studio", display_order=0, is_active=False)
        response = self.client.get(self.public)
        self.assertEqual([row["id"] for row in response.data["data"]], [first.pk, tied.pk, late.pk])
        self.assertTrue(all(set(row) == {"id", "name", "display_order"} for row in response.data["data"]))
        self.assertEqual(self._public_names(home=True), ["First Studio", "Second Studio", "Later Studio"])

    def test_admin_reorder_and_explicit_order_edit_reach_public_home(self):
        first = Company.objects.create(name="First Studio", display_order=0, is_active=True)
        second = Company.objects.create(name="Second Studio", display_order=1, is_active=True)
        self.client.force_authenticate(self.admin)
        response = self.client.patch(reverse("admin-companies-reorder"), {"order": [second.pk, first.pk]}, format="json")
        self.assertEqual(response.status_code, 200, response.data)
        self.client.force_authenticate(None)
        self.assertEqual(self._public_names(home=True), ["Second Studio", "First Studio"])
        self.client.force_authenticate(self.admin)
        response = self.client.patch(reverse("admin-company-detail", args=[second.pk]), {"display_order": 10}, format="json")
        self.assertEqual(response.status_code, 200)
        self.client.force_authenticate(None)
        self.assertEqual(self._public_names(home=True), ["First Studio", "Second Studio"])

    def test_normal_customer_and_anonymous_cannot_manage_companies(self):
        company = Company.objects.create(name="Original Studio", display_order=4)
        detail = reverse("admin-company-detail", args=[company.pk])
        operations = [
            ("get", self.collection, None), ("post", self.collection, {"name": "Intruder"}),
            ("get", detail, None), ("put", detail, {"name": "Intruder"}),
            ("patch", detail, {"name": "Intruder"}), ("delete", detail, None),
            ("patch", reverse("admin-companies-reorder"), {"order": [company.pk]}),
        ]
        for actor, denied in [(None, 401), (self.customer, 403)]:
            self.client.force_authenticate(actor)
            for method, url, payload in operations:
                with self.subTest(actor="anonymous" if actor is None else "customer", method=method, url=url):
                    response = getattr(self.client, method)(url, payload, format="json")
                    self.assertEqual(response.status_code, denied)
        company.refresh_from_db()
        self.assertEqual((company.name, company.display_order), ("Original Studio", 4))
        self.assertEqual(Company.objects.count(), 1)

    def test_company_names_and_display_orders_are_validated(self):
        self.client.force_authenticate(self.admin)
        invalid_names = ["", "   ", "Bad\nName", "Bad\tName", "x" * 151, None]
        for name in invalid_names:
            with self.subTest(name=name):
                self.assertEqual(self.client.post(self.collection, {"name": name}, format="json").status_code, 400)
        invalid_orders = [-1, 1.5, 1.0, True, "1.5", "1e3", "NaN", "Infinity", 2147483648, [], {}]
        for value in invalid_orders:
            with self.subTest(display_order=value):
                response = self.client.post(self.collection, {"name": "Example Studio", "display_order": value}, format="json")
                self.assertEqual(response.status_code, 400, response.data)
        self.assertEqual(Company.objects.count(), 0)
        response = self.client.post(self.collection, {"name": "  Café & Co  ", "display_order": " 3 "}, format="json")
        self.assertEqual(response.status_code, 201, response.data)
        self.assertEqual(response.data["data"]["name"], "Café & Co")

    def test_new_company_stays_hidden_until_admin_explicitly_enables_it(self):
        self.client.force_authenticate(self.admin)
        response = self.client.post(self.collection, {"name": "Example Studio"}, format="json")
        self.assertEqual(response.status_code, 201)
        company_id = response.data["data"]["id"]
        self.assertFalse(response.data["data"]["is_active"])
        self.client.force_authenticate(None)
        self.assertEqual(self._public_names(home=True), [])
        self.client.force_authenticate(self.admin)
        response = self.client.patch(reverse("admin-company-detail", args=[company_id]), {"is_active": True}, format="json")
        self.assertEqual(response.status_code, 200)
        self.client.force_authenticate(None)
        self.assertEqual(self._public_names(home=True), ["Example Studio"])

    def test_name_only_full_update_preserves_existing_visibility(self):
        company = Company.objects.create(name="Original Studio", display_order=4, is_active=True)
        self.client.force_authenticate(self.admin)
        response = self.client.put(reverse("admin-company-detail", args=[company.pk]), {"name": "Updated Studio"}, format="json")
        self.assertEqual(response.status_code, 200)
        company.refresh_from_db()
        self.assertEqual((company.name, company.display_order, company.is_active), ("Updated Studio", 4, True))

    def test_invalid_reorders_do_not_partially_modify_companies(self):
        first = Company.objects.create(name="First Studio", display_order=4)
        second = Company.objects.create(name="Second Studio", display_order=7)
        self.client.force_authenticate(self.admin)
        bad_orders = [[], [first.pk, first.pk], [True], [1.5], [-1], ["1.0"], [first.pk, second.pk + 1000], "bad"]
        for order in bad_orders:
            with self.subTest(order=order):
                response = self.client.patch(reverse("admin-companies-reorder"), {"order": order}, format="json")
                self.assertEqual(response.status_code, 400, response.data)
                self.assertEqual(list(Company.objects.order_by("pk").values_list("display_order", flat=True)), [4, 7])

    def test_public_company_endpoints_are_read_only(self):
        for url in (self.public, reverse("public-home")):
            for method in ("post", "put", "patch", "delete"):
                with self.subTest(url=url, method=method):
                    self.assertEqual(getattr(self.client, method)(url, {"name": "Intruder"}, format="json").status_code, 405)
        self.assertFalse(Company.objects.exists())
