from django.core.management.base import BaseCommand

from accounts import onboarding
from accounts.models import CustomerOnboarding


class Command(BaseCommand):
    help = (
        "Re-sends welcome emails that failed to deliver, for accounts still waiting for their first "
        "password setup. Each retry issues a NEW temporary password (old ones are never stored). "
        "Safe to run from cron."
    )

    def handle(self, *args, **options):
        pending = CustomerOnboarding.objects.select_related("user").filter(
            email_status=CustomerOnboarding.EmailStatus.FAILED, user__must_change_password=True
        )
        count = 0
        for item in pending:
            # Inline (sync) — a background thread would die with the command.
            if onboarding.reissue_and_send(item.user, sync=True):
                count += 1
        self.stdout.write(self.style.SUCCESS(f"Re-sent login details to {count} customer(s)."))
