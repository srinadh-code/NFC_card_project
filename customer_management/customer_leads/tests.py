from django.urls import reverse
from rest_framework import status

from common.test_utils import AuthenticatedAPITestCase
from profiles.models import Profile

from .models import Lead


class SubmitLeadViewTests(AuthenticatedAPITestCase):
    def test_anonymous_visitor_can_submit_a_lead(self):
        profile = Profile.ensure_for_user(self.user)
        self.client.force_authenticate(user=None)

        payload = {
            "username": profile.username,
            "name": "Visitor Name",
            "email": "visitor@example.com",
            "message": "Let's connect!",
        }
        response = self.client.post(reverse("customer-leads"), payload, format="json")

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(Lead.objects.filter(user=self.user).count(), 1)

    def test_requires_email_or_phone(self):
        profile = Profile.ensure_for_user(self.user)
        self.client.force_authenticate(user=None)

        payload = {"username": profile.username, "name": "No Contact Info"}
        response = self.client.post(reverse("customer-leads"), payload, format="json")

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_unknown_username_returns_404(self):
        self.client.force_authenticate(user=None)
        payload = {"username": "nobody-here", "name": "Test", "email": "a@b.com"}
        response = self.client.post(reverse("customer-leads"), payload, format="json")
        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)


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
