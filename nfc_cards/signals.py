# Mirrors orders.signals's pre_save/post_save pattern: a single signal is
# the one source of "NFC Card Updates" notifications, so every real status
# change notifies the card's owner exactly once regardless of which view
# triggered it — the customer's own activate/deactivate-by-uid flow
# (nfc_cards.views) *and* every admin action (admin_api.cards.views: assign,
# force-activate, block, mark lost, or a generic status edit). Without this,
# "NFC Card Updates" would only ever fire for the one customer-initiated
# path that used to call notify() directly.
from django.db.models.signals import post_save, pre_save
from django.dispatch import receiver

from customer_management.customer_notifications.models import Notification
from customer_management.customer_notifications.services import notify

from .models import NfcCard


@receiver(pre_save, sender=NfcCard)
def _stash_previous_status(sender, instance, **kwargs):
    if instance.pk:
        instance._previous_status = (
            NfcCard.objects.filter(pk=instance.pk).values_list("status", flat=True).first()
        )
    else:
        instance._previous_status = None


@receiver(post_save, sender=NfcCard)
def _notify_on_card_change(sender, instance, created, **kwargs):
    if not instance.user_id:
        # Unassigned inventory — no customer account to notify.
        return

    if created:
        notify(
            instance.user,
            f"NFC card {instance.serial_number} added to your account",
            f"Your card is now {instance.get_status_display()}.",
            type=Notification.Type.NFC_UPDATE,
        )
        return

    previous_status = getattr(instance, "_previous_status", None)
    if previous_status is not None and previous_status != instance.status:
        notify(
            instance.user,
            f"NFC card {instance.serial_number} {instance.get_status_display().lower()}",
            f"Your card's status changed to {instance.get_status_display()}.",
            type=Notification.Type.NFC_UPDATE,
        )
