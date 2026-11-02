from django.urls import reverse
from rest_framework import status

from common.test_utils import AuthenticatedAPITestCase
from profiles.models import Profile

from .models import Lead


VALID_ENQUIRY = {
    "name": "Visitor Name",
    "email": "visitor@example.com",
    "phone": "+91 98765 43210",
    "message": "Hi, I am interested in your services.",
}


class SubmitLeadViewTests(AuthenticatedAPITestCase):
    def setUp(self):
        super().setUp()
        self.profile = Profile.ensure_for_user(self.user)
        self.client.force_authenticate(user=None)  # visitors are anonymous

    def _submit(self, username=None, **overrides):
        payload = {"username": username or self.profile.username, **VALID_ENQUIRY, **overrides}
        return self.client.post(reverse("customer-leads"), payload, format="json")

    def _dashboard_leads(self, user):
        self.client.force_authenticate(user=user)
        try:
            return self.client.get(reverse("customer-dashboard")).data["data"]["totals"]["leads"]
        finally:
            self.client.force_authenticate(user=None)

    def test_anonymous_visitor_can_submit_a_lead(self):
        response = self._submit()

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        lead = Lead.objects.get(user=self.user)
        self.assertEqual(
            (lead.name, lead.email, lead.phone, lead.message, lead.status),
            ("Visitor Name", "visitor@example.com", "+91 98765 43210", VALID_ENQUIRY["message"], Lead.Status.NEW),
        )
        self.assertEqual(response.data["data"]["status"], "NEW")

    def test_each_enquiry_increases_the_owners_leads_count_by_one(self):
        self.assertEqual(self._dashboard_leads(self.user), 0)
        self._submit()
        self.assertEqual(self._dashboard_leads(self.user), 1)
        self._submit(name="Second Visitor", email="second@example.com")
        self.assertEqual(self._dashboard_leads(self.user), 2)
        self.assertEqual(self._dashboard_leads(self.other_user), 0)

    def test_viewing_the_profile_does_not_create_a_lead(self):
        self.client.get(reverse("profile-public", args=[self.profile.username]))
        self.assertEqual(Lead.objects.count(), 0)

    def test_requires_name_email_phone_and_message(self):
        for field in ["name", "email", "phone", "message"]:
            with self.subTest(field=field):
                response = self._submit(**{field: ""})
                self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(Lead.objects.count(), 0)

    def test_rejects_invalid_email_and_phone(self):
        self.assertEqual(self._submit(email="not-an-email").status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(self._submit(phone="12345").status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(self._submit(phone="call me maybe").status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(Lead.objects.count(), 0)

    def test_repeated_identical_submission_is_saved_once(self):
        first = self._submit()
        second = self._submit()

        self.assertEqual(first.status_code, status.HTTP_201_CREATED)
        self.assertEqual(second.status_code, status.HTTP_200_OK)
        self.assertEqual(second.data["data"]["id"], first.data["data"]["id"])
        self.assertEqual(Lead.objects.filter(user=self.user).count(), 1)

    def test_unknown_username_returns_404(self):
        response = self._submit(username="nobody-here")
        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)

    def test_private_profile_returns_404(self):
        self.profile.profile_public = False
        self.profile.save(update_fields=["profile_public"])
        self.assertEqual(self._submit().status_code, status.HTTP_404_NOT_FOUND)
        self.assertEqual(Lead.objects.count(), 0)


class UpdateLeadStatusViewTests(AuthenticatedAPITestCase):
    def setUp(self):
        super().setUp()
        self.lead = Lead.objects.create(user=self.user, name="Lead", email="lead@example.com")

    def _patch(self, lead, value):
        return self.client.patch(reverse("customer-lead-detail", args=[lead.pk]), {"status": value}, format="json")

    def test_owner_can_update_status(self):
        for value in ["CONTACTED", "CONVERTED", "NEW"]:
            with self.subTest(value=value):
                response = self._patch(self.lead, value)
                self.assertEqual(response.status_code, status.HTTP_200_OK)
                self.lead.refresh_from_db()
                self.assertEqual(self.lead.status, value)

    def test_rejects_unknown_status(self):
        self.assertEqual(self._patch(self.lead, "LOST").status_code, status.HTTP_400_BAD_REQUEST)

    def test_cannot_update_another_customers_lead(self):
        other = Lead.objects.create(user=self.other_user, name="Theirs", email="t@example.com")
        self.assertEqual(self._patch(other, "CONTACTED").status_code, status.HTTP_404_NOT_FOUND)
        other.refresh_from_db()
        self.assertEqual(other.status, Lead.Status.NEW)

    def test_requires_authentication(self):
        self.client.force_authenticate(user=None)
        self.assertEqual(self._patch(self.lead, "CONTACTED").status_code, status.HTTP_401_UNAUTHORIZED)


class ListLeadsViewTests(AuthenticatedAPITestCase):
    def _create_lead(self, user, **overrides):
        defaults = {"name": "Lead", "email": "lead@example.com", "company": "Acme"}
        defaults.update(overrides)
        return Lead.objects.create(user=user, **defaults)

    def test_lists_only_own_leads(self):
        self._create_lead(self.user)
        self._create_lead(self.other_user)

        response = self.client.get(reverse("customer-leads"))

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(len(response.data["data"]), 1)

    def test_search_filters_by_name_or_company(self):
        self._create_lead(self.user, name="Alice Smith", company="Initech")
        self._create_lead(self.user, name="Bob Jones", company="Acme")

        response = self.client.get(reverse("customer-leads"), {"search": "Initech"})

        self.assertEqual(len(response.data["data"]), 1)
        self.assertEqual(response.data["data"][0]["name"], "Alice Smith")

    def test_filters_by_status_newest_first(self):
        older = self._create_lead(self.user, name="Older")
        self._create_lead(self.user, name="Contacted", status=Lead.Status.CONTACTED)
        newer = self._create_lead(self.user, name="Newer")

        response = self.client.get(reverse("customer-leads"), {"status": "NEW"})

        self.assertEqual([row["id"] for row in response.data["data"]], [newer.id, older.id])

    def test_paginates(self):
        for i in range(12):
            self._create_lead(self.user, name=f"Lead {i}")

        response = self.client.get(reverse("customer-leads"), {"page": 2, "page_size": 5})

        self.assertEqual(response.data["pagination"]["count"], 12)
        self.assertEqual(response.data["pagination"]["num_pages"], 3)
        self.assertEqual(len(response.data["data"]), 5)

    def test_requires_authentication(self):
        self.client.force_authenticate(user=None)
        response = self.client.get(reverse("customer-leads"))
        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)


class ExportLeadsViewTests(AuthenticatedAPITestCase):
    def test_export_returns_csv(self):
        Lead.objects.create(user=self.user, name="Export Me", email="export@example.com")

        response = self.client.get(reverse("customer-leads-export"))

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response["Content-Type"], "text/csv")
        content = response.content.decode()
        self.assertIn("Export Me", content)
        self.assertIn("export@example.com", content)

    def test_requires_authentication(self):
        self.client.force_authenticate(user=None)
        response = self.client.get(reverse("customer-leads-export"))
        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)
