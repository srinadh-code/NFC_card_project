import requests
from django.conf import settings
from django.core.mail import get_connection
from django.core.management.base import BaseCommand

from accounts.onboarding import real_delivery_available, send_email, smtp_configured


class Command(BaseCommand):
    help = (
        "Diagnoses outgoing email (Brevo API key, SMTP login) without sending anything. "
        "Pass --send-to you@example.com to also send one real test email."
    )

    def add_arguments(self, parser):
        parser.add_argument("--send-to", help="Send a real test email to this address after the checks.")

    def handle(self, *args, **options):
        ok = True
        if settings.BREVO_API_KEY:
            try:
                r = requests.get(
                    "https://api.brevo.com/v3/account",
                    headers={"api-key": settings.BREVO_API_KEY, "accept": "application/json"},
                    timeout=15,
                )
            except requests.RequestException as exc:
                ok = False
                self.stdout.write(self.style.ERROR(f"Brevo: unreachable ({type(exc).__name__})"))
            else:
                if r.status_code < 300:
                    self.stdout.write(self.style.SUCCESS("Brevo: API key accepted"))
                    senders = requests.get(
                        "https://api.brevo.com/v3/senders",
                        headers={"api-key": settings.BREVO_API_KEY, "accept": "application/json"},
                        timeout=15,
                    ).json().get("senders", [])
                    match = [s for s in senders if s.get("email", "").lower() == settings.BREVO_SENDER_EMAIL.lower()]
                    if match and match[0].get("active"):
                        self.stdout.write(self.style.SUCCESS("Brevo: sender address is verified"))
                    else:
                        ok = False
                        self.stdout.write(self.style.ERROR(
                            "Brevo: BREVO_SENDER_EMAIL is not a verified sender — add/verify it under Brevo > Senders"
                        ))
                else:
                    ok = False
                    try:
                        detail = r.json()
                    except ValueError:
                        detail = {}
                    self.stdout.write(self.style.ERROR(
                        f"Brevo: rejected (HTTP {r.status_code} {detail.get('code', '')}: {detail.get('message', '')}) — "
                        "create a new API key in Brevo > SMTP & API > API Keys and set BREVO_API_KEY"
                    ))
        else:
            self.stdout.write("Brevo: not configured (BREVO_API_KEY empty)")

        if smtp_configured():
            try:
                connection = get_connection(fail_silently=False)
                connection.open()
                connection.close()
                self.stdout.write(self.style.SUCCESS("SMTP: login succeeded"))
            except Exception as exc:  # noqa: BLE001
                ok = False
                self.stdout.write(self.style.ERROR(f"SMTP: failed ({type(exc).__name__}: {str(exc)[:160]})"))
        else:
            self.stdout.write("SMTP: not configured (EMAIL_HOST empty)")

        if not real_delivery_available():
            ok = False
            self.stdout.write(self.style.ERROR("No real email delivery is configured — OTP and account emails cannot be sent."))

        if options.get("send_to"):
            try:
                sent = send_email(
                    options["send_to"],
                    "VRS GATEWAY email test",
                    "<p>This is a test email from VRS GATEWAY.</p>",
                    "This is a test email from VRS GATEWAY.",
                    "purpose=diagnostic",
                )
            except Exception as exc:  # noqa: BLE001
                sent = False
                self.stdout.write(self.style.ERROR(f"Test email: failed ({type(exc).__name__})"))
            self.stdout.write(self.style.SUCCESS("Test email: accepted for delivery") if sent else self.style.ERROR("Test email: NOT sent"))
            ok = ok and sent

        self.stdout.write(self.style.SUCCESS("Email delivery looks good.") if ok else self.style.WARNING("Email delivery needs attention (see above)."))
