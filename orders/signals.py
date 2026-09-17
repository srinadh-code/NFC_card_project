# Mirrors customer_management.customer_orders.signals — same pattern,
# same shared notify() service, same Notification.Type.ORDER_UPDATE — but
# wired to *this* app's Order model, the one the real checkout flow, admin
# order management, and every other admin_api module actually reads and
# writes (see config/urls.py's own comment on why customer_orders.Order is
# routed to nothing: it's a separate, unused table). Without this, "Order
# Updates" notifications would only ever fire for an Order model no live
# request ever creates a row in.
from django.db.models.signals import post_save, pre_save
from django.dispatch import receiver

from accounts.emails import send_order_confirmation_email
from customer_management.customer_notifications.models import Notification
from customer_management.customer_notifications.services import notify

from .models import Order


@receiver(pre_save, sender=Order)
def _stash_previous_status(sender, instance, **kwargs):
    if instance.pk:
        instance._previous_status = (
            Order.objects.filter(pk=instance.pk).values_list("status", flat=True).first()
        )
    else:
        instance._previous_status = None


@receiver(post_save, sender=Order)
def _notify_on_order_change(sender, instance, created, **kwargs):
    if created:
        notify(
            instance.customer,
            f"Order #{instance.pk} placed",
            "We've received your order and will confirm it shortly.",
            type=Notification.Type.ORDER_UPDATE,
        )
        # The order confirmation email carries the customer's secure Track
        # Order link (order.tracking_token) — see accounts/emails.py. Never
        # raises, so a mail-provider outage can't roll back order creation.
        send_order_confirmation_email(instance.customer, instance)
        return

    previous_status = getattr(instance, "_previous_status", None)
    if previous_status is not None and previous_status != instance.status:
        notify(
            instance.customer,
            f"Order #{instance.pk} {instance.get_status_display().lower()}",
            f"Your order status changed to {instance.get_status_display()}.",
            type=Notification.Type.ORDER_UPDATE,
        )
