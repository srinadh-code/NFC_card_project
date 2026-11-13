from django.urls import path

from . import views

urlpatterns = [
    path("token/refresh/", views.AccountTokenRefreshView.as_view(), name="auth-token-refresh"),
    path("register/", views.RegisterView.as_view(), name="auth-register"),
    path("verify-email/", views.VerifyEmailView.as_view(), name="auth-verify-email"),
    path("resend-otp/", views.ResendOtpView.as_view(), name="auth-resend-otp"),
    path("login/", views.LoginView.as_view(), name="auth-login"),
    path("activation/check/", views.AccountActivationCheckView.as_view(), name="auth-activation-check"),
    path("activation/complete/", views.AccountActivationCompleteView.as_view(), name="auth-activation-complete"),
    path("purchaser-setup/request/", views.PurchaserSetupRequestView.as_view(), name="auth-purchaser-setup-request"),
    path("logout/", views.LogoutView.as_view(), name="auth-logout"),
    path("forgot-password/", views.ForgotPasswordView.as_view(), name="auth-forgot-password"),
    path("verify-reset-otp/", views.VerifyResetOtpView.as_view(), name="auth-verify-reset-otp"),
    path("reset-password/", views.ResetPasswordView.as_view(), name="auth-reset-password"),
    path("change-password/", views.ChangePasswordView.as_view(), name="auth-change-password"),
    path("google/", views.GoogleLoginView.as_view(), name="auth-google"),
    path("me/", views.MeView.as_view(), name="auth-me"),
]
