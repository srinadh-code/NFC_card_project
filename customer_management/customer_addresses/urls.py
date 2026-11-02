from django.urls import path

from . import views

urlpatterns = [
    path("", views.CustomerAddressListCreateView.as_view(), name="customer-addresses"),
    path("pincode/<str:pincode>/", views.PincodeLookupView.as_view(), name="customer-pincode-lookup"),
    path("geocode/search/", views.GeocodeSearchView.as_view(), name="customer-geocode-search"),
    path("geocode/reverse/", views.GeocodeReverseView.as_view(), name="customer-geocode-reverse"),
    path("<int:pk>/", views.CustomerAddressDetailView.as_view(), name="customer-address-detail"),
    path("<int:pk>/set-default/", views.CustomerAddressSetDefaultView.as_view(), name="customer-address-set-default"),
    path("<int:pk>/verify/", views.CustomerAddressVerifyView.as_view(), name="customer-address-verify"),
]
