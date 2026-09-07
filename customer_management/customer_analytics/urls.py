from django.urls import path

from . import views

urlpatterns = [
    path("", views.CustomerAnalyticsOverviewView.as_view(), name="customer-analytics-overview"),
    path("summary/", views.CustomerAnalyticsSummaryView.as_view(), name="customer-analytics-summary"),
    path("views/", views.CustomerAnalyticsViewsView.as_view(), name="customer-analytics-views"),
    path("taps/", views.CustomerAnalyticsTapsView.as_view(), name="customer-analytics-taps"),
    path("scans/", views.CustomerAnalyticsScansView.as_view(), name="customer-analytics-scans"),
    path(
        "track/social-click/",
        views.TrackSocialClickView.as_view(),
        name="customer-analytics-track-social-click",
    ),
]
