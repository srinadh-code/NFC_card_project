from django.core.management.base import BaseCommand

from nfc_cards.models import NfcCard

DEMO_UIDS = [
    "04AABBCC0001",
    "04AABBCC0002",
    "04AABBCC0003",
    "04AABBCC0004",
    "04AABBCC0005",
]


class Command(BaseCommand):
    help = "Creates a handful of UNASSIGNED demo NFC cards with known UIDs for manual Phase A testing."

    def handle(self, *args, **options):
        created = 0
        for uid in DEMO_UIDS:
            if NfcCard.objects.filter(uid=uid).exists():
                continue
            NfcCard.objects.create(
                uid=uid,
                serial_number=NfcCard.generate_serial_number(),
                card_type=NfcCard.CardType.STANDARD,
                color="Black",
                status=NfcCard.Status.UNASSIGNED,
            )
            created += 1

        self.stdout.write(self.style.SUCCESS(f"Created {created} demo card(s)."))
        self.stdout.write("Demo UIDs you can activate via POST /api/nfc/cards/activate/:")
        for uid in DEMO_UIDS:
            self.stdout.write(f"  - {uid}")
