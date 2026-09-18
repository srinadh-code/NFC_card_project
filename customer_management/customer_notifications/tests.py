from django.urls import reverse
from rest_framework import status
from rest_framework.test import APITestCase

from accounts.models import User
from common.test_utils import AuthenticatedAPITestCase, make_user
from customer_management.customer_settings.models import CustomerSettings

from .models import Announcement, Notification
from .services import create_announcement


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


class DeleteNotificationViewTests(AuthenticatedAPITestCase):
    """Deletion is an explicit customer action, entirely separate from
    read/unread state — see NotificationDetailView / services.delete_notification."""

    def test_customer_can_delete_their_own_notification(self):
        n = Notification.objects.create(user=self.user, title="Delete me")

        response = self.client.delete(reverse("customer-notification-detail", args=[n.id]))

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertFalse(Notification.objects.filter(pk=n.id).exists())

    def test_customer_cannot_delete_another_customers_notification(self):
        other_notification = Notification.objects.create(user=self.other_user, title="Not yours")

        response = self.client.delete(reverse("customer-notification-detail", args=[other_notification.id]))

        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)
        self.assertTrue(Notification.objects.filter(pk=other_notification.id).exists())

    def test_deleting_a_read_notification_works(self):
        n = Notification.objects.create(user=self.user, title="Already read", is_read=True)

        response = self.client.delete(reverse("customer-notification-detail", args=[n.id]))

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertFalse(Notification.objects.filter(pk=n.id).exists())

    def test_deleting_an_unread_notification_works_and_lowers_unread_count(self):
        n = Notification.objects.create(user=self.user, title="Unread", is_read=False)

        self.client.delete(reverse("customer-notification-detail", args=[n.id]))

        response = self.client.get(reverse("customer-notifications"), {"unread_only": "true"})
        self.assertEqual(response.data["pagination"]["count"], 0)

    def test_deleting_a_nonexistent_notification_is_handled_gracefully(self):
        response = self.client.delete(reverse("customer-notification-detail", args=[999999]))
        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)
        self.assertNotIn("Traceback", str(response.data))

    def test_deleting_the_same_notification_twice_is_handled_gracefully(self):
        n = Notification.objects.create(user=self.user, title="Delete twice")
        self.client.delete(reverse("customer-notification-detail", args=[n.id]))

        response = self.client.delete(reverse("customer-notification-detail", args=[n.id]))

        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)

    def test_deleting_a_notification_does_not_affect_the_source_order(self):
        """The notification is a projection of the event, not the event
        itself — deleting it must never touch the Order (or any other
        business record) it was created from."""
        from orders.models import Order

        order = Order.objects.create(
            customer=self.user,
            amount="499.00",
            shipping="49.00",
            payment_method=Order.PaymentMethod.UPI,
            payment_status=Order.PaymentStatus.PAID,
            status=Order.Status.SHIPPED,
            shipping_line1="123 Main St",
            shipping_city="Hyderabad",
            shipping_state="Telangana",
            shipping_pincode="500001",
        )
        notification = Notification.objects.filter(user=self.user, type=Notification.Type.ORDER_UPDATE).latest(
            "created_at"
        )

        self.client.delete(reverse("customer-notification-detail", args=[notification.id]))

        order.refresh_from_db()
        self.assertEqual(order.status, Order.Status.SHIPPED)
        self.assertTrue(Order.objects.filter(pk=order.pk).exists())

    def test_requires_authentication(self):
        n = Notification.objects.create(user=self.user, title="One")
        self.client.force_authenticate(user=None)

        response = self.client.delete(reverse("customer-notification-detail", args=[n.id]))

        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)
        self.assertTrue(Notification.objects.filter(pk=n.id).exists())


class DeleteReadNotificationsViewTests(AuthenticatedAPITestCase):
    def test_deletes_only_read_notifications(self):
        read1 = Notification.objects.create(user=self.user, title="Read one", is_read=True)
        read2 = Notification.objects.create(user=self.user, title="Read two", is_read=True)
        unread = Notification.objects.create(user=self.user, title="Unread", is_read=False)

        response = self.client.delete(reverse("customer-notifications-delete-read"))

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["data"]["deleted"], 2)
        self.assertFalse(Notification.objects.filter(pk=read1.id).exists())
        self.assertFalse(Notification.objects.filter(pk=read2.id).exists())
        self.assertTrue(Notification.objects.filter(pk=unread.id).exists())

    def test_unread_count_is_unchanged_after_delete_all_read(self):
        Notification.objects.create(user=self.user, title="Read", is_read=True)
        Notification.objects.create(user=self.user, title="Unread 1", is_read=False)
        Notification.objects.create(user=self.user, title="Unread 2", is_read=False)

        self.client.delete(reverse("customer-notifications-delete-read"))

        response = self.client.get(reverse("customer-notifications"), {"unread_only": "true"})
        self.assertEqual(response.data["pagination"]["count"], 2)

    def test_does_not_delete_another_customers_read_notifications(self):
        other_read = Notification.objects.create(user=self.other_user, title="Not yours", is_read=True)

        self.client.delete(reverse("customer-notifications-delete-read"))

        self.assertTrue(Notification.objects.filter(pk=other_read.id).exists())

    def test_requires_authentication(self):
        self.client.force_authenticate(user=None)
        response = self.client.delete(reverse("customer-notifications-delete-read"))
        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)


class CreateAnnouncementServiceTests(APITestCase):
    """System Messages: the smallest proper admin announcement mechanism —
    an Announcement row plus a real notify() call per customer, still
    gated by each customer's own notify_system_messages preference. Not a
    fake/demo notification: every one of these came from create_announcement,
    which only the admin-only view (AdminAnnouncementListCreateView) calls."""

    def setUp(self):
        self.admin = make_user(email="admin@example.com", role=User.Role.ADMIN, is_staff=True)
        self.opted_in = make_user(email="opted-in@example.com")
        self.opted_out = make_user(email="opted-out@example.com")
        settings_obj = CustomerSettings.ensure_for_user(self.opted_out)
        settings_obj.notify_system_messages = False
        settings_obj.save(update_fields=["notify_system_messages"])

    def test_notifies_every_opted_in_customer(self):
        create_announcement(self.admin, "Maintenance window", "We'll be down for 1 hour on Sunday.")

        self.assertTrue(
            Notification.objects.filter(
                user=self.opted_in, type=Notification.Type.SYSTEM_MESSAGE, title="Maintenance window"
            ).exists()
        )

    def test_does_not_notify_customers_who_opted_out(self):
        create_announcement(self.admin, "Maintenance window", "We'll be down for 1 hour on Sunday.")

        self.assertFalse(
            Notification.objects.filter(user=self.opted_out, type=Notification.Type.SYSTEM_MESSAGE).exists()
        )

    def test_records_a_real_recipient_count(self):
        announcement = create_announcement(self.admin, "New feature", "Check out Google Review Cards.")

        self.assertEqual(announcement.recipient_count, 1)  # only opted_in, not opted_out or the admin

    def test_creates_exactly_one_announcement_record(self):
        create_announcement(self.admin, "Hello", "World")
        self.assertEqual(Announcement.objects.count(), 1)


class AdminAnnouncementViewTests(APITestCase):
    def setUp(self):
        self.admin = make_user(email="admin2@example.com", role=User.Role.ADMIN, is_staff=True)
        self.customer = make_user(email="regular-customer@example.com")

    def test_admin_can_send_an_announcement(self):
        self.client.force_authenticate(user=self.admin)
        response = self.client.post(
            reverse("admin-announcements"),
            {"title": "Holiday hours", "message": "We're closed on the 25th."},
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertTrue(
            Notification.objects.filter(
                user=self.customer, type=Notification.Type.SYSTEM_MESSAGE, title="Holiday hours"
            ).exists()
        )

    def test_admin_can_list_sent_announcements(self):
        create_announcement(self.admin, "Past announcement", "Already sent.")
        self.client.force_authenticate(user=self.admin)

        response = self.client.get(reverse("admin-announcements"))

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(len(response.data["data"]), 1)
        self.assertEqual(response.data["data"][0]["title"], "Past announcement")

    def test_regular_customer_cannot_send_an_announcement(self):
        self.client.force_authenticate(user=self.customer)
        response = self.client.post(
            reverse("admin-announcements"), {"title": "Should not work"}, format="json"
        )

        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)
        self.assertFalse(Announcement.objects.exists())

    def test_requires_authentication(self):
        response = self.client.post(reverse("admin-announcements"), {"title": "Nope"}, format="json")
        self.assertIn(response.status_code, (status.HTTP_401_UNAUTHORIZED, status.HTTP_403_FORBIDDEN))

    def test_requires_a_title(self):
        self.client.force_authenticate(user=self.admin)
        response = self.client.post(reverse("admin-announcements"), {}, format="json")
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
