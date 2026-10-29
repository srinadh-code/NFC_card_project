from django.urls import path

from . import views

# Mounted separately from urls.py (which config/urls.py already exposes at
# /api/customer/notifications/, all IsCustomerRole) so this stays
# unmistakably a public route: /api/announcements/public/. Same
# customer_notifications app/Announcement model — no second announcement
# system, just a narrower, unauthenticated read (see
# PublicAnnouncementSerializer for what's excluded).
urlpatterns = [
    path("", views.PublicAnnouncementListView.as_view(), name="public-announcements"),
]
