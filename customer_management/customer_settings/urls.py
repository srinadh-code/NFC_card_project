from django.urls import path

from . import views

urlpatterns = [
    path("", views.CustomerSettingsView.as_view(), name="customer-settings"),
]
