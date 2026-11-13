import requests
from django.conf import settings
from django.core.mail import get_connection
from django.core.management.base import BaseCommand, CommandError

from accounts.emails import BREVO_MESSAGE_ID_RE, BREVO_SAFE_ERROR_CODES, _email_connection_and_sender
from accounts.onboarding import real_delivery_available, send_email, smtp_configured


class Command(BaseCommand):
    help = (
        "Diagnoses outgoing email (Brevo API key, SMTP login) without sending anything. "
        "Pass --send-to you@example.com to also send one real test email."
    )

    def add_arguments(self, parser):
        parser.add_argument("--send-to", help="Send a real test email to this address after the checks.")
        parser.add_argument("--message-id", help="Inspect existing Brevo events for this message ID without sending mail.")

    def _brevo_get(self, path, label, params=None):
        try:
            response = requests.get(
                f"https://api.brevo.com/v3/{path}",
                headers={"api-key": settings.BREVO_API_KEY, "accept": "application/json"},
                params=params,
                timeout=15,
            )
        except requests.RequestException as exc:
            self.stdout.write(self.style.ERROR(f"Brevo {label}: unreachable ({type(exc).__name__})"))
            return None
        try:
            detail = response.json()
        except ValueError:
            detail = None
        if not 200 <= response.status_code < 300:
            code = detail.get("code") if isinstance(detail, dict) else None
            safe_code = code if isinstance(code, str) and code in BREVO_SAFE_ERROR_CODES else "provider_error"
            self.stdout.write(self.style.ERROR(
                f"Brevo {label}: rejected (HTTP {response.status_code}; code={safe_code})"
            ))
            return None
        if not isinstance(detail, dict):
            self.stdout.write(self.style.ERROR(f"Brevo {label}: malformed response; status could not be verified."))
            return None
        return detail

    def _message_events(self, message_id):
        detail = self._brevo_get("smtp/statistics/events", "events", {
            "messageId": message_id, "limit": 100, "sort": "desc",
        })
        if detail is None:
            return False
        events = detail.get("events")
        if not isinstance(events, list) or any(not isinstance(event, dict) for event in events):
            self.stdout.write(self.style.ERROR("Brevo events: malformed response; delivery is unverified."))
            return False
        matching = [event for event in events if (event.get("messageId") or event.get("message-id")) == message_id]
        if not matching:
            self.stdout.write(self.style.WARNING("Brevo message: no matching events; delivery is unverified."))
            return False
        categories = {
            "accepted": "accepted", "requests": "accepted", "sent": "accepted",
            "delivered": "delivered", "deferred": "deferred",
            "softbounce": "deferred", "softbounces": "deferred",
            "bounced": "bounced", "hardbounce": "bounced", "hardbounces": "bounced",
            "blocked": "blocked", "unsubscribed": "blocked", "spam": "blocked",
            "failed": "failed", "error": "failed", "invalid": "failed", "invalidemail": "failed",
        }
        engagement_events = {"opened", "clicks", "proxy", "firstopening"}
        states = []
        for event in matching:
            value = event.get("event")
            key = value.lower().replace("_", "").replace("-", "") if isinstance(value, str) else ""
            if key in engagement_events:
                continue
            state = categories.get(key, "unknown")
            if state not in states:
                states.append(state)
        if not states:
            states.append("unknown")
        self.stdout.write("Brevo message events (newest first): " + ", ".join(states) + ".")
        return all(state in {"accepted", "delivered"} for state in states)

    def handle(self, *args, **options):
        message_id = options.get("message_id")
        if message_id is not None and (not isinstance(message_id, str) or not BREVO_MESSAGE_ID_RE.fullmatch(message_id)):
            raise CommandError("Invalid Brevo message ID.")
        ok = True
        if settings.BREVO_API_KEY:
            account = self._brevo_get("account", "account")
            if account is not None:
                self.stdout.write(self.style.SUCCESS("Brevo: API key accepted"))
                relay = account.get("relay")
                enabled = relay.get("enabled") if isinstance(relay, dict) else None
                if enabled is False:
                    ok = False
                    self.stdout.write(self.style.ERROR("Brevo: transactional relay is disabled."))
                elif enabled is True:
                    self.stdout.write(self.style.SUCCESS("Brevo: transactional relay is enabled."))
                else:
                    ok = False
                    self.stdout.write(self.style.WARNING("Brevo: transactional relay status is unknown."))
                detail = self._brevo_get("senders", "senders")
                senders = detail.get("senders") if detail is not None else None
                if not isinstance(senders, list) or any(not isinstance(sender, dict) for sender in senders):
                    ok = False
                    if detail is not None:
                        self.stdout.write(self.style.ERROR("Brevo senders: malformed response; sender verification is unknown."))
                else:
                    match = [sender for sender in senders if isinstance(sender.get("email"), str)
                             and sender["email"].lower() == settings.BREVO_SENDER_EMAIL.lower()]
                    if match and match[0].get("active") is True:
                        self.stdout.write(self.style.SUCCESS("Brevo: sender address is verified"))
                    else:
                        ok = False
                        self.stdout.write(self.style.ERROR(
                            "Brevo: BREVO_SENDER_EMAIL is not a verified sender — add/verify it under Brevo > Senders"
                        ))
            else:
                ok = False
            if message_id:
                ok = self._message_events(message_id) and ok
        else:
            self.stdout.write("Brevo: not configured (BREVO_API_KEY empty)")
            if message_id:
                ok = False
                self.stdout.write(self.style.WARNING("Brevo events: unavailable without API configuration; delivery is unverified."))

        if smtp_configured():
            try:
                connection, _ = _email_connection_and_sender()
                if connection is None:
                    connection = get_connection(fail_silently=False)
                connection.open()
                connection.close()
                self.stdout.write(self.style.SUCCESS("SMTP: login succeeded"))
            except Exception as exc:  # noqa: BLE001
                ok = False
                self.stdout.write(self.style.ERROR(f"SMTP: failed ({type(exc).__name__})"))
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
            self.stdout.write(self.style.SUCCESS("Test email: accepted by transport; inbox delivery unverified.") if sent else self.style.ERROR("Test email: NOT accepted"))
            ok = ok and sent

        self.stdout.write(self.style.SUCCESS("Configuration/acceptance checks passed; inbox delivery remains unverified.")
                          if ok else self.style.WARNING("Configuration/acceptance checks need attention; inbox delivery remains unverified."))
