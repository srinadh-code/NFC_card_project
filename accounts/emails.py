from django.conf import settings
from django.core.mail import send_mail


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

    send_mail(
        subject=subject,
        message=body,
        from_email=settings.DEFAULT_FROM_EMAIL,
        recipient_list=[user.email],
        fail_silently=False,
    )
