from django.urls import path

from . import views

urlpatterns = [
    path("razorpay/config/", views.RazorpayConfigView.as_view(), name="razorpay-config"),
    path("recipient-email-availability/", views.RecipientEmailAvailabilityView.as_view(), name="recipient-email-availability"),
    path("checkout/cancel/", views.CheckoutCancelView.as_view(), name="checkout-cancel"),
    path("verification/send/", views.CheckoutOtpSendView.as_view(), name="checkout-otp-send"),
    path("verification/verify/", views.CheckoutOtpVerifyView.as_view(), name="checkout-otp-verify"),
    path("razorpay/checkout/", views.RazorpayCheckoutView.as_view(), name="razorpay-checkout"),
    path("razorpay/verify/", views.RazorpayVerifyView.as_view(), name="razorpay-verify"),
    path("razorpay/webhook/", views.RazorpayWebhookView.as_view(), name="razorpay-webhook"),
    path("dummy/confirm/", views.DummyPaymentConfirmView.as_view(), name="dummy-payment-confirm"),
]
