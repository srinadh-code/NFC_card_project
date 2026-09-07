from django.urls import path

from . import views

urlpatterns = [
    path("cards/mine/", views.MyCardsView.as_view(), name="nfc-cards-mine"),
    path("cards/activate/", views.ActivateCardView.as_view(), name="nfc-cards-activate"),
    path(
        "cards/<int:pk>/activate-assigned/",
        views.ActivateAssignedCardView.as_view(),
        name="nfc-cards-activate-assigned",
    ),
    path("cards/<str:identifier>/", views.CardResolveView.as_view(), name="nfc-cards-resolve"),
    # Aliases matching the customer-module API spec — same views/behavior as
    # the `cards/...` routes above, kept so neither naming scheme breaks.
    path("my-card/", views.MyCardsView.as_view(), name="nfc-my-card"),
    path("activate/", views.ActivateCardView.as_view(), name="nfc-activate"),
    path("deactivate/", views.DeactivateCardView.as_view(), name="nfc-deactivate"),
]
