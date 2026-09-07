from django.urls import path

from . import views

urlpatterns = [
    path("", views.CustomerDashboardView.as_view(), name="customer-dashboard"),
]
