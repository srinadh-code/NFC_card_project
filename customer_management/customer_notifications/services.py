from django.db.models import Q
from django.utils import timezone

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


def notify(user, title, message="", type=Notification.Type.SYSTEM_MESSAGE, announcement=None):
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

    return Notification.objects.create(
        user=user, title=title, message=message, type=type, announcement=announcement
    )


# ---------------------------------------------------------------------
# Announcements — admin CRUD + the customer/public fan-out.
# ---------------------------------------------------------------------


def list_announcements():
    return Announcement.objects.select_related("created_by").all()


def create_announcement(created_by, data):
    announcement = Announcement(created_by=created_by, **data)
    if announcement.is_published:
        announcement.ever_published = True
    announcement.full_clean()
    announcement.save()
    if announcement.is_published:
        _fan_out_to_customers(announcement)
    return announcement


def update_announcement(announcement, data):
    for field, value in data.items():
        setattr(announcement, field, value)
    if announcement.is_published:
        announcement.ever_published = True
    announcement.full_clean()
    announcement.save()
    if announcement.is_published:
        # Covers both "just published via PATCH" and "display_location
        # edited to add Customer Dashboard after already publishing" —
        # _fan_out_to_customers is a no-op for anyone already notified.
        _fan_out_to_customers(announcement)
    return announcement


def set_published(announcement, is_published):
    announcement.is_published = is_published
    update_fields = ["is_published", "updated_at"]
    if is_published and not announcement.ever_published:
        announcement.ever_published = True
        update_fields.append("ever_published")
    announcement.save(update_fields=update_fields)
    if is_published:
        _fan_out_to_customers(announcement)
    return announcement


def delete_announcement(announcement):
    announcement.delete()


def _fan_out_to_customers(announcement):
    """Sends this one announcement's Notifications now, if it targets
    customers, is due (start_at has passed, if any), and hasn't already
    been sent — the same idempotent guard sync_due_customer_announcements()
    relies on, so calling this eagerly at publish time and lazily on every
    notification read can never double-send."""
    if announcement.notified_at is not None:
        return
    if announcement.display_location not in (
        Announcement.DisplayLocation.CUSTOMER,
        Announcement.DisplayLocation.BOTH,
    ):
        return
    now = timezone.now()
    if announcement.start_at and announcement.start_at > now:
        return
    if announcement.end_at and announcement.end_at < now:
        return

    from accounts.models import User

    recipient_count = 0
    for customer in User.objects.filter(role=User.Role.CUSTOMER).iterator():
        created = notify(
            customer,
            announcement.title,
            announcement.message,
            type=Notification.Type.SYSTEM_MESSAGE,
            announcement=announcement,
        )
        if created is not None:
            recipient_count += 1

    announcement.recipient_count = recipient_count
    announcement.notified_at = now
    announcement.save(update_fields=["recipient_count", "notified_at"])


def sync_due_customer_announcements():
    """Called on every customer notification read (see views.py) — the
    dependency-free stand-in for a scheduled task: a *scheduled* customer
    announcement (start_at in the future at publish time) only actually
    reaches customers once someone opens their notification bell after
    start_at has passed. Cheap and safe to call on every request: the
    `notified_at__isnull=True` filter means there's nothing to do on 99% of
    calls, and _fan_out_to_customers is itself idempotent."""
    now = timezone.now()
    due = (
        Announcement.objects.filter(
            is_published=True,
            notified_at__isnull=True,
            display_location__in=[Announcement.DisplayLocation.CUSTOMER, Announcement.DisplayLocation.BOTH],
        )
        .filter(Q(start_at__isnull=True) | Q(start_at__lte=now))
        .filter(Q(end_at__isnull=True) | Q(end_at__gte=now))
    )
    for announcement in due:
        _fan_out_to_customers(announcement)


def list_active_public_announcements():
    now = timezone.now()
    return (
        Announcement.objects.filter(
            is_published=True,
            display_location__in=[Announcement.DisplayLocation.PUBLIC, Announcement.DisplayLocation.BOTH],
        )
        .filter(Q(start_at__isnull=True) | Q(start_at__lte=now))
        .filter(Q(end_at__isnull=True) | Q(end_at__gte=now))
    )


def list_notifications(user, unread_only=False):
    # Runs on every notification read (list, unread-count) — cheap no-op
    # unless a scheduled customer announcement has just become due, in
    # which case this is what actually fans it out (see
    # sync_due_customer_announcements's docstring).
    sync_due_customer_announcements()
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
