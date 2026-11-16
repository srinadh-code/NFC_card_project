from django.core.management.base import BaseCommand

from accounts import onboarding
from accounts.emails import PERMANENT_RECIPIENT_FAILURE_CODES
from accounts.models import CustomerOnboarding, EmailOTP


class Command(BaseCommand):
    help = (
        "Retries account activation and purchaser setup emails that failed to send, for accounts still waiting to set "
        "their password. Each retry issues a NEW set-password link (the old one stops working). "
        "Safe to run from cron."
    )

    def handle(self, *args, **options):
        pending = CustomerOnboarding.objects.select_related("user").filter(
            email_status=CustomerOnboarding.EmailStatus.FAILED,
            user__must_change_password=True,
            credentials_issued_at__isnull=False,
        ).exclude(email_last_error__in=PERMANENT_RECIPIENT_FAILURE_CODES)
        count = 0
        for item in pending:
            # Inline (sync) — a background thread would die with the command.
            if onboarding.reissue_and_send(item.user, sync=True):
                count += 1
        purchasers = EmailOTP.objects.select_related("user").filter(
            purpose=EmailOTP.Purpose.PURCHASER,
            email_status=EmailOTP.EmailStatus.FAILED,
            is_used=False,
            user__must_change_password=True,
        ).exclude(email_last_error__in=PERMANENT_RECIPIENT_FAILURE_CODES)
        purchaser_count = 0
        for item in purchasers:
            # The helper locks and rechecks the current credential before
            # issuing a replacement. Accepted, queued and uncertain attempts
            # must not become automatic duplicate mail.
            if onboarding.retry_purchaser_setup(item.user, sync=True):
                purchaser_count += 1
        self.stdout.write(self.style.SUCCESS(
            f"Queued retries for {count} recipient activation(s) and {purchaser_count} purchaser setup(s). "
            "Email delivery remains unverified."
        ))
