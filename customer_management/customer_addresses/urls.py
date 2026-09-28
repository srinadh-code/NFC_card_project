from django.urls import path

from . import views

urlpatterns = [
    path("", views.CustomerAddressListCreateView.as_view(), name="customer-addresses"),
    path("<int:pk>/", views.CustomerAddressDetailView.as_view(), name="customer-address-detail"),
    path("<int:pk>/set-default/", views.CustomerAddressSetDefaultView.as_view(), name="customer-address-set-default"),
]
