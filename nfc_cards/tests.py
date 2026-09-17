from django.urls import reverse
from rest_framework import status

from common.test_utils import AuthenticatedAPITestCase
from customer_management.customer_analytics.models import AnalyticsEvent
from customer_management.customer_notifications.models import Notification
from customer_management.customer_settings.models import CustomerSettings
from profiles.models import Profile

from .models import NfcCard


class NfcCardTestMixin:
    def make_card(self, uid="04AABBCC0001", status_=NfcCard.Status.UNASSIGNED, user=None):
        return NfcCard.objects.create(
            uid=uid,
            serial_number=NfcCard.generate_serial_number(),
            status=status_,
            user=user,
        )


class MyCardsViewTests(NfcCardTestMixin, AuthenticatedAPITestCase):
    def test_lists_only_own_cards(self):
        self.make_card(uid="04AABBCC0001", status_=NfcCard.Status.ACTIVE, user=self.user)
        self.make_card(uid="04AABBCC0002", status_=NfcCard.Status.ACTIVE, user=self.other_user)

        response = self.client.get(reverse("nfc-my-card"))

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(len(response.data["data"]), 1)
        self.assertEqual(response.data["data"][0]["uid"], "04AABBCC0001")

    def test_requires_authentication(self):
        self.client.force_authenticate(user=None)
        response = self.client.get(reverse("nfc-my-card"))
        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)


class ActivateCardViewTests(NfcCardTestMixin, AuthenticatedAPITestCase):
    def test_activates_unclaimed_card(self):
        self.make_card(uid="04AABBCC0003", status_=NfcCard.Status.UNASSIGNED)

        response = self.client.post(reverse("nfc-activate"), {"uid": "04AABBCC0003"}, format="json")

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        card = NfcCard.objects.get(uid="04AABBCC0003")
        self.assertEqual(card.user_id, self.user.id)
        self.assertEqual(card.status, NfcCard.Status.ACTIVE)
        self.assertEqual(
            Notification.objects.filter(user=self.user, type=Notification.Type.NFC_UPDATE).count(), 1
        )

    def test_no_notification_when_nfc_updates_disabled(self):
        settings_obj = CustomerSettings.ensure_for_user(self.user)
        settings_obj.notify_nfc_updates = False
        settings_obj.save(update_fields=["notify_nfc_updates"])
        self.make_card(uid="04AABBCC0099", status_=NfcCard.Status.UNASSIGNED)

        self.client.post(reverse("nfc-activate"), {"uid": "04AABBCC0099"}, format="json")

        self.assertFalse(
            Notification.objects.filter(user=self.user, type=Notification.Type.NFC_UPDATE).exists()
        )

    def test_rejects_card_claimed_by_another_account(self):
        self.make_card(uid="04AABBCC0004", status_=NfcCard.Status.ACTIVE, user=self.other_user)

        response = self.client.post(reverse("nfc-activate"), {"uid": "04AABBCC0004"}, format="json")

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_rejects_blocked_card(self):
        self.make_card(uid="04AABBCC0005", status_=NfcCard.Status.BLOCKED)

        response = self.client.post(reverse("nfc-activate"), {"uid": "04AABBCC0005"}, format="json")

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_rejects_unknown_uid(self):
        response = self.client.post(reverse("nfc-activate"), {"uid": "DOES-NOT-EXIST"}, format="json")
        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)


class DeactivateCardViewTests(NfcCardTestMixin, AuthenticatedAPITestCase):
    def test_deactivates_own_active_card(self):
        self.make_card(uid="04AABBCC0006", status_=NfcCard.Status.ACTIVE, user=self.user)

        response = self.client.post(reverse("nfc-deactivate"), {"uid": "04AABBCC0006"}, format="json")

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        card = NfcCard.objects.get(uid="04AABBCC0006")
        self.assertEqual(card.status, NfcCard.Status.INACTIVE)

    def test_cannot_deactivate_another_users_card(self):
        self.make_card(uid="04AABBCC0007", status_=NfcCard.Status.ACTIVE, user=self.other_user)

        response = self.client.post(reverse("nfc-deactivate"), {"uid": "04AABBCC0007"}, format="json")

        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)
        card = NfcCard.objects.get(uid="04AABBCC0007")
        self.assertEqual(card.status, NfcCard.Status.ACTIVE)

    def test_cannot_deactivate_a_card_that_is_not_active(self):
        self.make_card(uid="04AABBCC0008", status_=NfcCard.Status.UNASSIGNED, user=self.user)

        response = self.client.post(reverse("nfc-deactivate"), {"uid": "04AABBCC0008"}, format="json")

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_requires_authentication(self):
        self.client.force_authenticate(user=None)
        response = self.client.post(reverse("nfc-deactivate"), {"uid": "04AABBCC0009"}, format="json")
        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)


class AdminTriggeredNfcNotificationTests(NfcCardTestMixin, AuthenticatedAPITestCase):
    """NFC Card Updates must fire on *real* admin status changes too, not
    just the customer's own activate-by-uid flow — see nfc_cards/signals.py,
    which is now the single source of these notifications (admin_api.cards
    views never call notify() directly)."""

    def test_admin_blocking_a_card_notifies_its_owner(self):
        card = self.make_card(uid="04AABBCC0050", status_=NfcCard.Status.ACTIVE, user=self.user)
        Notification.objects.filter(user=self.user).delete()  # isolate from the card-added notification

        card.status = NfcCard.Status.BLOCKED
        card.save(update_fields=["status", "updated_at"])

        self.assertTrue(
            Notification.objects.filter(user=self.user, type=Notification.Type.NFC_UPDATE).exists()
        )

    def test_admin_marking_a_card_lost_notifies_its_owner(self):
        card = self.make_card(uid="04AABBCC0051", status_=NfcCard.Status.ACTIVE, user=self.user)
        Notification.objects.filter(user=self.user).delete()  # isolate from the card-added notification

        card.status = NfcCard.Status.LOST
        card.save(update_fields=["status", "updated_at"])

        notification = Notification.objects.get(user=self.user, type=Notification.Type.NFC_UPDATE)
        self.assertIn("Lost", notification.message)

    def test_admin_assigning_a_card_notifies_the_new_owner(self):
        card = self.make_card(uid="04AABBCC0052", status_=NfcCard.Status.UNASSIGNED)

        card.user = self.user
        card.status = NfcCard.Status.ASSIGNED
        card.save(update_fields=["user", "status", "updated_at"])

        self.assertTrue(
            Notification.objects.filter(user=self.user, type=Notification.Type.NFC_UPDATE).exists()
        )

    def test_no_notification_for_unassigned_inventory_changes(self):
        """A card with no customer attached has no one to notify — this
        must never 500 or create an orphaned notification."""
        card = self.make_card(uid="04AABBCC0053", status_=NfcCard.Status.UNASSIGNED)

        card.status = NfcCard.Status.BLOCKED
        card.save(update_fields=["status", "updated_at"])

        self.assertFalse(Notification.objects.filter(type=Notification.Type.NFC_UPDATE).exists())

    def test_admin_status_change_respects_the_notify_nfc_updates_preference(self):
        settings_obj = CustomerSettings.ensure_for_user(self.user)
        settings_obj.notify_nfc_updates = False
        settings_obj.save(update_fields=["notify_nfc_updates"])
        card = self.make_card(uid="04AABBCC0054", status_=NfcCard.Status.ACTIVE, user=self.user)

        card.status = NfcCard.Status.BLOCKED
        card.save(update_fields=["status", "updated_at"])

        self.assertFalse(
            Notification.objects.filter(user=self.user, type=Notification.Type.NFC_UPDATE).exists()
        )

    def test_customer_deactivating_their_own_card_still_notifies_exactly_once(self):
        """Regression: activation notifications must not double up now that
        the signal (not an explicit call in the view) is the trigger."""
        self.make_card(uid="04AABBCC0055", status_=NfcCard.Status.UNASSIGNED)
        self.client.post(reverse("nfc-activate"), {"uid": "04AABBCC0055"}, format="json")
        Notification.objects.filter(user=self.user).delete()  # isolate from the activation notification

        self.client.post(reverse("nfc-deactivate"), {"uid": "04AABBCC0055"}, format="json")

        self.assertEqual(
            Notification.objects.filter(user=self.user, type=Notification.Type.NFC_UPDATE).count(), 1
        )


class CardResolveViewTests(NfcCardTestMixin, AuthenticatedAPITestCase):
    def test_resolves_active_card_with_public_profile(self):
        card = self.make_card(uid="04AABBCC0010", status_=NfcCard.Status.ACTIVE, user=self.user)
        Profile.ensure_for_user(self.user)

        self.client.force_authenticate(user=None)
        response = self.client.get(reverse("nfc-cards-resolve", args=[card.uid]))

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertIn("redirect_url", response.data["data"])
        self.assertEqual(
            AnalyticsEvent.objects.filter(
                user=self.user, event_type=AnalyticsEvent.EventType.NFC_TAP
            ).count(),
            1,
        )

    def test_inactive_card_is_not_resolved(self):
        card = self.make_card(uid="04AABBCC0011", status_=NfcCard.Status.INACTIVE, user=self.user)

        self.client.force_authenticate(user=None)
        response = self.client.get(reverse("nfc-cards-resolve", args=[card.uid]))

        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)
