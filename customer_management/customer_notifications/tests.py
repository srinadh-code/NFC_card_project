from django.urls import reverse
from rest_framework import status

from common.test_utils import AuthenticatedAPITestCase

from .models import Notification


class ListNotificationsViewTests(AuthenticatedAPITestCase):
    def test_lists_only_own_notifications(self):
        Notification.objects.create(user=self.user, title="For me")
        Notification.objects.create(user=self.other_user, title="Not for me")

        response = self.client.get(reverse("customer-notifications"))

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(len(response.data["data"]), 1)
        self.assertEqual(response.data["data"][0]["title"], "For me")

    def test_unread_only_filter(self):
        Notification.objects.create(user=self.user, title="Read", is_read=True)
        Notification.objects.create(user=self.user, title="Unread", is_read=False)

        response = self.client.get(reverse("customer-notifications"), {"unread_only": "true"})

        self.assertEqual(len(response.data["data"]), 1)
        self.assertEqual(response.data["data"][0]["title"], "Unread")

    def test_requires_authentication(self):
        self.client.force_authenticate(user=None)
        response = self.client.get(reverse("customer-notifications"))
        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)


class MarkNotificationsReadViewTests(AuthenticatedAPITestCase):
    def test_marks_specific_ids_as_read(self):
        n1 = Notification.objects.create(user=self.user, title="One")
        n2 = Notification.objects.create(user=self.user, title="Two")

        response = self.client.post(reverse("customer-notifications-read"), {"ids": [n1.id]}, format="json")

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        n1.refresh_from_db()
        n2.refresh_from_db()
        self.assertTrue(n1.is_read)
        self.assertFalse(n2.is_read)

    def test_mark_all(self):
        Notification.objects.create(user=self.user, title="One")
        Notification.objects.create(user=self.user, title="Two")

        response = self.client.post(reverse("customer-notifications-read"), {"all": True}, format="json")

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(Notification.objects.filter(user=self.user, is_read=False).count(), 0)

    def test_cannot_mark_another_users_notification(self):
        other_notification = Notification.objects.create(user=self.other_user, title="Not yours")

        self.client.post(
            reverse("customer-notifications-read"), {"ids": [other_notification.id]}, format="json"
        )

        other_notification.refresh_from_db()
        self.assertFalse(other_notification.is_read)

    def test_requires_ids_or_all(self):
        response = self.client.post(reverse("customer-notifications-read"), {}, format="json")
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
