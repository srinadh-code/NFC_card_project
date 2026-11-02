from django.urls import path

from . import views

urlpatterns = [
    path("", views.CustomerOrderListCreateView.as_view(), name="my-orders"),
    path("track/", views.OrderTrackingByTokenView.as_view(), name="public-order-tracking"),
    path("<int:pk>/", views.CustomerOrderDetailView.as_view(), name="my-order-detail"),
    path("<int:pk>/cancel/", views.CustomerOrderCancelView.as_view(), name="my-order-cancel"),
]
