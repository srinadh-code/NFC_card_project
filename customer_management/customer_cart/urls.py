from django.urls import path

from . import views

urlpatterns = [
    path("", views.CartView.as_view(), name="customer-cart"),
    path("items/", views.CartItemListCreateView.as_view(), name="customer-cart-items"),
    path("items/<int:pk>/", views.CartItemDetailView.as_view(), name="customer-cart-item-detail"),
    path("promo-code/", views.CartPromoCodeView.as_view(), name="customer-cart-promo-code"),
    path("offers/", views.CartAvailableOffersView.as_view(), name="customer-cart-offers"),
    path("apply-offer/", views.CartApplyOfferView.as_view(), name="customer-cart-apply-offer"),
]
