from django.urls import path

from . import views

urlpatterns = [
    path("", views.CustomerNotificationsView.as_view(), name="customer-notifications"),
    path("read/", views.MarkNotificationsReadView.as_view(), name="customer-notifications-read"),
]
