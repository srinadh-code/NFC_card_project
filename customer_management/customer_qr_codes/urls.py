from django.urls import path

from . import views

urlpatterns = [
    path("", views.CustomerQrCodeView.as_view(), name="customer-qr"),
    path("generate/", views.GenerateQrCodeView.as_view(), name="customer-qr-generate"),
    path("regenerate/", views.RegenerateQrCodeView.as_view(), name="customer-qr-regenerate"),
]
