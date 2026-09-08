from django.conf import settings
from django.conf.urls.static import static
from django.contrib import admin
from django.urls import include, path

urlpatterns = [
    path("admin/", admin.site.urls),
    path("api/auth/", include("accounts.urls")),
    path("api/profiles/", include("profiles.urls")),
    path("api/nfc/", include("nfc_cards.urls")),
    path("api/admin/", include("admin_api.urls")),
    path("api/customer/profile/", include("customer_management.customer_profiles.urls")),
    path("api/customer/social-links/", include("customer_management.customer_social_links.urls")),
    path("api/customer/qr/", include("customer_management.customer_qr_codes.urls")),
    path("api/customer/analytics/", include("customer_management.customer_analytics.urls")),
    # Deliberately NOT customer_management.customer_orders: that app's Order
    # model is a separate table admin_api never reads from, so anything
    # created there would be invisible on the admin side. This routes to the
    # `orders` app instead — the same Order model admin_api.orders,
    # admin_api.dashboard, admin_api.transactions and admin_api.reports all
    # already use, so a customer's order is immediately visible to admin.
    path("api/customer/orders/", include("orders.urls")),
    path("api/customer/leads/", include("customer_management.customer_leads.urls")),
    path("api/customer/notifications/", include("customer_management.customer_notifications.urls")),
    path("api/customer/settings/", include("customer_management.customer_settings.urls")),
    path("api/customer/dashboard/", include("customer_management.customer_dashboard.urls")),
    path("api/customer/services/", include("customer_management.customer_services.urls")),
]

if settings.DEBUG:
    urlpatterns += static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)
