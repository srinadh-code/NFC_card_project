from django.conf import settings
from django.core.mail import get_connection, send_mail


def _email_connection_and_sender():
    """Admin-configured SMTP host/port/from-address (Settings > Email)
    override the server's env-configured defaults for real, live-sent mail
    when set — auth credentials stay env-only (EMAIL_HOST_USER/PASSWORD),
    same "no credential in an admin-editable row" rule as Payment Settings.
    Returns (connection, from_email); connection is None to mean "use
    Django's default backend/settings" when nothing has been configured."""
    from website_content.models import EmailSettings

    email_settings = EmailSettings.objects.first()
    if email_settings is None or not email_settings.smtp_host:
        return None, settings.DEFAULT_FROM_EMAIL

    # EMAIL_HOST_USER/PASSWORD/USE_TLS only exist on `settings` at all when
    # EMAIL_HOST was set at process start (see config/settings.py) — getattr
    # with a default avoids an AttributeError when only the DB-configured
    # host is being used without any env SMTP config present.
    connection = get_connection(
        backend="django.core.mail.backends.smtp.EmailBackend",
        host=email_settings.smtp_host,
        port=email_settings.smtp_port or 587,
        username=getattr(settings, "EMAIL_HOST_USER", ""),
        password=getattr(settings, "EMAIL_HOST_PASSWORD", ""),
        use_tls=getattr(settings, "EMAIL_USE_TLS", True),
    )
    from_email = email_settings.from_address or settings.DEFAULT_FROM_EMAIL
    return connection, from_email


def send_otp_email(user, otp, purpose):
    if purpose == "REGISTER":
        subject = "Verify your VR's NEXORA account"
        body = (
            f"Hi {user.full_name or user.email},\n\n"
            f"Your verification code is: {otp.code}\n"
            f"This code expires in 10 minutes.\n\n"
            "If you didn't request this, you can ignore this email."
        )
    else:
        subject = "Reset your VR's NEXORA password"
        body = (
            f"Hi {user.full_name or user.email},\n\n"
            f"Your password reset code is: {otp.code}\n"
            f"This code expires in 10 minutes.\n\n"
            "If you didn't request this, you can ignore this email."
        )

    connection, from_email = _email_connection_and_sender()
    send_mail(
        subject=subject,
        message=body,
        from_email=from_email,
        recipient_list=[user.email],
        fail_silently=False,
        connection=connection,
    )
