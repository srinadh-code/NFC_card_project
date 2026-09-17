from .models import Announcement, Notification

# Which CustomerSettings boolean gates each notification type — the single
# place this mapping exists, so every caller (order status changes, NFC
# activation, profile views, system messages) automatically respects the
# customer's preference just by calling notify() normally, with nothing
# extra for the caller to remember. Add a new Notification.Type here (and a
# matching field on CustomerSettings) rather than duplicating a preference
# check at each call site.
_PREFERENCE_FIELD_FOR_TYPE = {
    Notification.Type.ORDER_UPDATE: "notify_order_updates",
    Notification.Type.NFC_UPDATE: "notify_nfc_updates",
    Notification.Type.PROFILE_VIEW: "notify_profile_views",
    Notification.Type.SYSTEM_MESSAGE: "notify_system_messages",
}


def notify(user, title, message="", type=Notification.Type.SYSTEM_MESSAGE):
    """Creates a Notification for `user`, unless they've turned this
    category off in CustomerSettings — checked here, once, so no caller can
    forget to and no notification is ever created just to be hidden by the
    frontend afterwards."""
    if user is None:
        return None

    pref_field = _PREFERENCE_FIELD_FOR_TYPE.get(type)
    if pref_field is not None:
        from customer_management.customer_settings.models import CustomerSettings

        settings_obj = CustomerSettings.ensure_for_user(user)
        if not getattr(settings_obj, pref_field):
            return None

    return Notification.objects.create(user=user, title=title, message=message, type=type)


def create_announcement(created_by, title, message=""):
    """The one place a System Message is ever created — an admin action,
    never a fabricated/demo notification. Every current customer gets a
    real notify() call (so notify_system_messages is still respected per
    customer, exactly like every other notification type); the Announcement
    row itself is the permanent record of what was actually sent."""
    from accounts.models import User

    announcement = Announcement.objects.create(title=title, message=message, created_by=created_by)

    recipient_count = 0
    for customer in User.objects.filter(role=User.Role.CUSTOMER).iterator():
        created = notify(customer, title, message, type=Notification.Type.SYSTEM_MESSAGE)
        if created is not None:
            recipient_count += 1

    announcement.recipient_count = recipient_count
    announcement.save(update_fields=["recipient_count"])
    return announcement


def list_notifications(user, unread_only=False):
    queryset = Notification.objects.filter(user=user)
    if unread_only:
        queryset = queryset.filter(is_read=False)
    return queryset


def mark_read(user, ids=None, mark_all=False):
    queryset = Notification.objects.filter(user=user)
    if not mark_all:
        queryset = queryset.filter(id__in=ids or [])
    return queryset.update(is_read=True)


def delete_notification(user, notification_id):
    """Deletes exactly one notification the requesting user owns — never
    the underlying event it was created from (Order, NfcCard, Announcement,
    etc. are untouched; only this Notification row goes away). Scoped by
    `user=user` in the same query that finds the row, so a ownership check
    is not a separate step a caller could forget: an id belonging to another
    customer simply doesn't match, exactly like CustomerOrderDetailView's
    `.filter(pk=pk, customer=request.user)`. Returns True if a row was
    actually deleted, False for "already gone / never existed / not yours"
    — the view treats all three identically (404), so a request can't probe
    which case it hit."""
    deleted_count, _ = Notification.objects.filter(pk=notification_id, user=user).delete()
    return deleted_count > 0


def delete_read_notifications(user):
    """'Delete all read' — is_read=True is part of the same query as the
    ownership scope, so an unread notification can never be swept up by
    this even by a race (a notification that becomes read between the
    query and the delete is exactly the one this action correctly assumes
    the customer wants gone)."""
    deleted_count, _ = Notification.objects.filter(user=user, is_read=True).delete()
    return deleted_count
