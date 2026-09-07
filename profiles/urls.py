from django.urls import include, path
from rest_framework.routers import DefaultRouter

from admin_api.customers import views as admin_views

from . import views

router = DefaultRouter()
router.register("social-links", views.SocialLinkViewSet, basename="social-link")
router.register("custom-links", views.CustomLinkViewSet, basename="custom-link")
router.register("custom-fields", views.CustomFieldViewSet, basename="custom-field")

urlpatterns = [
    path("me/", views.MyProfileView.as_view(), name="profile-me"),
    path("me/avatar/", views.MyAvatarView.as_view(), name="profile-me-avatar"),
    path("public/<str:username>/", views.PublicProfileView.as_view(), name="profile-public"),
    # Legacy path kept for backward compatibility with the existing frontend
    # (@/lib/api adminCustomerApi). The canonical, organized home for this
    # admin logic is now admin_api.customers — see admin_api/urls.py for the
    # new /api/admin/customers/ equivalent, which routes to the same views.
    path("admin/customers/", admin_views.AdminCustomerListView.as_view(), name="profile-admin-customers"),
    path(
        "admin/customers/<int:pk>/",
        admin_views.AdminCustomerDetailView.as_view(),
        name="profile-admin-customer-detail",
    ),
    path("", include(router.urls)),
]
