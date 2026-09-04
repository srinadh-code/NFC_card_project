from django.urls import include, path
from rest_framework.routers import DefaultRouter

from . import views

router = DefaultRouter()
router.register("social-links", views.SocialLinkViewSet, basename="social-link")
router.register("custom-links", views.CustomLinkViewSet, basename="custom-link")
router.register("custom-fields", views.CustomFieldViewSet, basename="custom-field")

urlpatterns = [
    path("me/", views.MyProfileView.as_view(), name="profile-me"),
    path("me/avatar/", views.MyAvatarView.as_view(), name="profile-me-avatar"),
    path("public/<str:username>/", views.PublicProfileView.as_view(), name="profile-public"),
    path("", include(router.urls)),
]
