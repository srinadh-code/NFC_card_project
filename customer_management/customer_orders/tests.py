# This app's Order model was never the one admin_api reads (admin_api.orders,
# .dashboard, .transactions and .reports all use orders.Order instead), so an
# order created here was invisible to admin — a real bug, not a style choice.
# config/urls.py now routes /api/customer/orders/ to orders.urls, which
# shares admin's Order model, so this app's own routes are no longer mounted
# anywhere and these tests (which relied on reverse("customer-orders")
# resolving to this app's urls.py) no longer apply. The model/views/
# serializers here are left in place, untouched, in case the notification-
# on-order-event and status-history behaviour they implement is worth
# porting onto orders.Order later.
