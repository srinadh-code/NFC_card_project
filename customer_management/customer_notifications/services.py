from .models import Notification


def notify(user, title, message="", type=Notification.Type.SYSTEM_MESSAGE):
    if user is None:
        return None
    return Notification.objects.create(user=user, title=title, message=message, type=type)


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
