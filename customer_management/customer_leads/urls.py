from django.urls import path

from . import views

urlpatterns = [
    path("", views.CustomerLeadsView.as_view(), name="customer-leads"),
    path("export/", views.CustomerLeadsExportView.as_view(), name="customer-leads-export"),
]
