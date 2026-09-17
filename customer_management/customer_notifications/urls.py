from django.urls import path

from . import views

urlpatterns = [
    path("", views.CustomerNotificationsView.as_view(), name="customer-notifications"),
    path("read/", views.MarkNotificationsReadView.as_view(), name="customer-notifications-read"),
    path("delete-read/", views.DeleteReadNotificationsView.as_view(), name="customer-notifications-delete-read"),
    path("<int:pk>/", views.NotificationDetailView.as_view(), name="customer-notification-detail"),
]
