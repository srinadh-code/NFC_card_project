from django.db.models.signals import post_save, pre_save
from django.dispatch import receiver

from customer_management.customer_notifications.models import Notification
from customer_management.customer_notifications.services import notify

from .models import Order, OrderStatusHistory


@receiver(pre_save, sender=Order)
def _stash_previous_status(sender, instance, **kwargs):
    if instance.pk:
        instance._previous_status = (
            Order.objects.filter(pk=instance.pk).values_list("status", flat=True).first()
        )
    else:
        instance._previous_status = None


@receiver(post_save, sender=Order)
def _record_status_history(sender, instance, created, **kwargs):
    if created:
        OrderStatusHistory.objects.create(order=instance, status=instance.status, note="Order placed.")
        notify(
            instance.user,
            f"Order {instance.order_number} placed",
            "We've received your order and will confirm it shortly.",
            type=Notification.Type.ORDER_UPDATE,
        )
        return

    previous_status = getattr(instance, "_previous_status", None)
    if previous_status is not None and previous_status != instance.status:
        OrderStatusHistory.objects.create(order=instance, status=instance.status)
        notify(
            instance.user,
            f"Order {instance.order_number} {instance.get_status_display().lower()}",
            f"Your order status changed to {instance.get_status_display()}.",
            type=Notification.Type.ORDER_UPDATE,
        )
