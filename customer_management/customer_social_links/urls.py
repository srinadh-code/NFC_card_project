from django.urls import path

from . import views

urlpatterns = [
    path("", views.CustomerSocialLinksView.as_view(), name="customer-social-links"),
]
