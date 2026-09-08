# Canonical, central Admin API surface — everything here lives under
# /api/admin/ (mounted in config/urls.py). This is the "new" home for admin
# logic; nfc_cards/urls.py and profiles/urls.py additionally expose two of
# these same view classes at their older paths for frontend backward
# compatibility (see the comments there).
from django.urls import path

from .analytics.views import AdminAnalyticsSummaryView
from .cards.views import (
    AdminCardActivateView,
    AdminCardAssignView,
    AdminCardBlockView,
    AdminCardDetailView,
    AdminCardListCreateView,
    AdminCardMarkLostView,
)
from .customers.views import AdminCustomerDetailView, AdminCustomerListView
from .dashboard import AdminDashboardView
from .orders.views import (
    AdminOrderAssignCardView,
    AdminOrderDetailView,
    AdminOrderListCreateView,
    AdminOrderStatusView,
)
from .profiles.views import (
    AdminProfileActivateView,
    AdminProfileDetailView,
    AdminProfileListCreateView,
    AdminProfileSuspendView,
)
from .reports.views import (
    AdminCustomerReportView,
    AdminOrderReportView,
    AdminSalesReportView,
    AdminTapAnalyticsReportView,
)
from .support.views import (
    AdminSupportTicketDetailView,
    AdminSupportTicketListCreateView,
    AdminTicketMessageView,
    AdminTicketPriorityView,
    AdminTicketStatusView,
)
from .transactions.views import AdminTransactionDetailView, AdminTransactionListCreateView

urlpatterns = [
    path("dashboard/", AdminDashboardView.as_view(), name="admin-dashboard"),
    # Customers
    path("customers/", AdminCustomerListView.as_view(), name="admin-customers"),
    path("customers/<int:pk>/", AdminCustomerDetailView.as_view(), name="admin-customer-detail"),
    # NFC Cards
    path("cards/", AdminCardListCreateView.as_view(), name="admin-cards"),
    path("cards/<int:pk>/", AdminCardDetailView.as_view(), name="admin-card-detail"),
    path("cards/<int:pk>/assign/", AdminCardAssignView.as_view(), name="admin-card-assign"),
    path("cards/<int:pk>/activate/", AdminCardActivateView.as_view(), name="admin-card-activate"),
    path("cards/<int:pk>/block/", AdminCardBlockView.as_view(), name="admin-card-block"),
    path("cards/<int:pk>/mark-lost/", AdminCardMarkLostView.as_view(), name="admin-card-mark-lost"),
    # Profiles
    path("profiles/", AdminProfileListCreateView.as_view(), name="admin-profiles"),
    path("profiles/<int:pk>/", AdminProfileDetailView.as_view(), name="admin-profile-detail"),
    path("profiles/<int:pk>/activate/", AdminProfileActivateView.as_view(), name="admin-profile-activate"),
    path("profiles/<int:pk>/suspend/", AdminProfileSuspendView.as_view(), name="admin-profile-suspend"),
    # Orders
    path("orders/", AdminOrderListCreateView.as_view(), name="admin-orders"),
    path("orders/<int:pk>/", AdminOrderDetailView.as_view(), name="admin-order-detail"),
    path("orders/<int:pk>/status/", AdminOrderStatusView.as_view(), name="admin-order-status"),
    path("orders/<int:pk>/assign-card/", AdminOrderAssignCardView.as_view(), name="admin-order-assign-card"),
    # Transactions
    path("transactions/", AdminTransactionListCreateView.as_view(), name="admin-transactions"),
    path("transactions/<int:pk>/", AdminTransactionDetailView.as_view(), name="admin-transaction-detail"),
    # Support
    path("support/", AdminSupportTicketListCreateView.as_view(), name="admin-support-tickets"),
    path("support/<int:pk>/", AdminSupportTicketDetailView.as_view(), name="admin-support-ticket-detail"),
    path("support/<int:pk>/status/", AdminTicketStatusView.as_view(), name="admin-support-ticket-status"),
    path("support/<int:pk>/priority/", AdminTicketPriorityView.as_view(), name="admin-support-ticket-priority"),
    path("support/<int:pk>/messages/", AdminTicketMessageView.as_view(), name="admin-support-ticket-messages"),
    # Analytics
    path("analytics/summary/", AdminAnalyticsSummaryView.as_view(), name="admin-analytics-summary"),
    # Reports
    path("reports/sales/", AdminSalesReportView.as_view(), name="admin-report-sales"),
    path("reports/tap-analytics/", AdminTapAnalyticsReportView.as_view(), name="admin-report-tap-analytics"),
    path("reports/customers/", AdminCustomerReportView.as_view(), name="admin-report-customers"),
    path("reports/orders/", AdminOrderReportView.as_view(), name="admin-report-orders"),
]
