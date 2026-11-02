from django.urls import path

from . import views

urlpatterns = [
    path("", views.CustomerLeadsView.as_view(), name="customer-leads"),
    path("<int:lead_id>/", views.CustomerLeadDetailView.as_view(), name="customer-lead-detail"),
    path("export/", views.CustomerLeadsExportView.as_view(), name="customer-leads-export"),
]
