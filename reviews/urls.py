from django.urls import path

from . import views

urlpatterns = [
    path("me/", views.CustomerReviewAPIView.as_view(), name="review-me"),
    path("public/", views.PublicReviewsAPIView.as_view(), name="review-public"),
]
