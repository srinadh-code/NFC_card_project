from django.urls import reverse
from rest_framework import status

from common.test_utils import AuthenticatedAPITestCase

from .models import CustomerService


class CustomerServiceListCreateViewTests(AuthenticatedAPITestCase):
    def test_create_service(self):
        response = self.client.post(
            reverse("customer-services"),
            {"title": "Web Development", "description": "Custom websites and portals."},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(response.data["data"]["display_order"], 0)
        self.assertTrue(response.data["data"]["is_active"])

    def test_create_requires_title(self):
        response = self.client.post(reverse("customer-services"), {"title": "  "}, format="json")
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_new_services_append_to_end(self):
        CustomerService.objects.create(user=self.user, title="First", display_order=0)
        response = self.client.post(reverse("customer-services"), {"title": "Second"}, format="json")
        self.assertEqual(response.data["data"]["display_order"], 1)

    def test_lists_only_own_services(self):
        CustomerService.objects.create(user=self.user, title="Mine")
        CustomerService.objects.create(user=self.other_user, title="Not mine")

        response = self.client.get(reverse("customer-services"))

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(len(response.data["data"]), 1)
        self.assertEqual(response.data["data"][0]["title"], "Mine")

    def test_requires_authentication(self):
        self.client.force_authenticate(user=None)
        response = self.client.get(reverse("customer-services"))
        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)


class CustomerServiceDetailViewTests(AuthenticatedAPITestCase):
    def test_patch_updates_own_service(self):
        service = CustomerService.objects.create(user=self.user, title="Old Title")

        response = self.client.patch(
            reverse("customer-service-detail", args=[service.id]), {"title": "New Title"}, format="json"
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        service.refresh_from_db()
        self.assertEqual(service.title, "New Title")

    def test_cannot_patch_another_users_service(self):
        service = CustomerService.objects.create(user=self.other_user, title="Not yours")

        response = self.client.patch(
            reverse("customer-service-detail", args=[service.id]), {"title": "Hijacked"}, format="json"
        )

        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)
        service.refresh_from_db()
        self.assertEqual(service.title, "Not yours")

    def test_delete_removes_own_service(self):
        service = CustomerService.objects.create(user=self.user, title="Delete me")

        response = self.client.delete(reverse("customer-service-detail", args=[service.id]))

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertFalse(CustomerService.objects.filter(id=service.id).exists())

    def test_cannot_delete_another_users_service(self):
        service = CustomerService.objects.create(user=self.other_user, title="Not yours")

        response = self.client.delete(reverse("customer-service-detail", args=[service.id]))

        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)
        self.assertTrue(CustomerService.objects.filter(id=service.id).exists())

    def test_put_requires_title(self):
        service = CustomerService.objects.create(user=self.user, title="Old Title")
        response = self.client.put(
            reverse("customer-service-detail", args=[service.id]), {"description": "no title"}, format="json"
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)


class ReorderCustomerServicesViewTests(AuthenticatedAPITestCase):
    def test_reorders_own_services(self):
        a = CustomerService.objects.create(user=self.user, title="A", display_order=0)
        b = CustomerService.objects.create(user=self.user, title="B", display_order=1)

        response = self.client.patch(
            reverse("customer-services-reorder"), {"order": [b.id, a.id]}, format="json"
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        a.refresh_from_db()
        b.refresh_from_db()
        self.assertEqual(b.display_order, 0)
        self.assertEqual(a.display_order, 1)

    def test_cannot_reorder_another_users_service(self):
        other_service = CustomerService.objects.create(user=self.other_user, title="Not yours", display_order=5)

        self.client.patch(reverse("customer-services-reorder"), {"order": [other_service.id]}, format="json")

        other_service.refresh_from_db()
        self.assertEqual(other_service.display_order, 5)
