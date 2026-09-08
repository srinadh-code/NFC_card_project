from django.urls import path

from . import views

urlpatterns = [
    path("", views.CustomerOrderListCreateView.as_view(), name="my-orders"),
    path("<int:pk>/", views.CustomerOrderDetailView.as_view(), name="my-order-detail"),
]
