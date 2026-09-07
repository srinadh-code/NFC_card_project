from django.urls import path

from . import views

urlpatterns = [
    path("", views.CustomerProfileView.as_view(), name="customer-profile"),
    path(
        "upload-image/",
        views.CustomerProfileImageUploadView.as_view(),
        name="customer-profile-upload-image",
    ),
    path(
        "upload-cover/",
        views.CustomerCoverImageUploadView.as_view(),
        name="customer-profile-upload-cover",
    ),
]
