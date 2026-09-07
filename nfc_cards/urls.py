from django.urls import path

from admin_api.cards import views as admin_views

from . import views

urlpatterns = [
    path("cards/mine/", views.MyCardsView.as_view(), name="nfc-cards-mine"),
    path("cards/activate/", views.ActivateCardView.as_view(), name="nfc-cards-activate"),
    path("cards/track/", views.TrackEventView.as_view(), name="nfc-cards-track"),
    path(
        "cards/<int:pk>/activate-assigned/",
        views.ActivateAssignedCardView.as_view(),
        name="nfc-cards-activate-assigned",
    ),
    # Legacy paths kept for backward compatibility with the existing
    # frontend (@/lib/api adminNfcApi), which calls these exact URLs. The
    # canonical, organized home for this admin logic is now admin_api.cards
    # — see admin_api/urls.py for the new /api/admin/cards/ equivalents,
    # which route to the very same view classes.
    path(
        "admin/cards/",
        admin_views.AdminCardListCreateView.as_view(),
        name="nfc-cards-admin-list-create",
    ),
    path(
        "admin/cards/<int:pk>/",
        admin_views.AdminCardDetailView.as_view(),
        name="nfc-cards-admin-detail",
    ),
    path(
        "admin/cards/<int:pk>/assign/",
        admin_views.AdminCardAssignView.as_view(),
        name="nfc-cards-admin-assign",
    ),
    path(
        "admin/cards/<int:pk>/activate/",
        admin_views.AdminCardActivateView.as_view(),
        name="nfc-cards-admin-activate",
    ),
    path(
        "admin/cards/<int:pk>/block/",
        admin_views.AdminCardBlockView.as_view(),
        name="nfc-cards-admin-block",
    ),
    path(
        "admin/cards/<int:pk>/mark-lost/",
        admin_views.AdminCardMarkLostView.as_view(),
        name="nfc-cards-admin-mark-lost",
    ),
    path("cards/<str:identifier>/", views.CardResolveView.as_view(), name="nfc-cards-resolve"),
    # Aliases matching the customer-module API spec — same views/behavior as
    # the `cards/...` routes above, kept so neither naming scheme breaks.
    path("my-card/", views.MyCardsView.as_view(), name="nfc-my-card"),
    path("activate/", views.ActivateCardView.as_view(), name="nfc-activate"),
    path("deactivate/", views.DeactivateCardView.as_view(), name="nfc-deactivate"),
]
