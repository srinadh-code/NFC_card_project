from django.urls import path

from . import views

urlpatterns = [
    path("", views.CustomerServiceListCreateView.as_view(), name="customer-services"),
    path("reorder/", views.ReorderCustomerServicesView.as_view(), name="customer-services-reorder"),
    path("<int:pk>/", views.CustomerServiceDetailView.as_view(), name="customer-service-detail"),
]
