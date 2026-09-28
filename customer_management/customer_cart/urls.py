from django.urls import path

from . import views

urlpatterns = [
    path("", views.CartView.as_view(), name="customer-cart"),
    path("items/", views.CartItemListCreateView.as_view(), name="customer-cart-items"),
    path("items/<int:pk>/", views.CartItemDetailView.as_view(), name="customer-cart-item-detail"),
]
