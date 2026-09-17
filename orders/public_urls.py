from django.urls import path

from . import views

# Mounted separately from urls.py (which config/urls.py already exposes at
# /api/customer/orders/, all IsAuthenticated) so this stays unmistakably a
# public route: /api/orders/track/<order_number>/. Same `orders` app, same
# Order model/serializers module — no second order system. <str:...> (not
# <int:...>) because order_number is the "NXTRK######" public code, not
# the internal numeric pk.
urlpatterns = [
    path("track/<str:order_number>/", views.PublicOrderTrackingView.as_view(), name="public-track-order"),
]
