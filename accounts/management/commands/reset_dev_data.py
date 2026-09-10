from django.conf import settings
from django.core.management.base import BaseCommand, CommandError
from django.db import transaction
from django.db.models import Q

from analytics.models import TapEvent
from nfc_cards.models import NfcCard
from orders.models import Order
from profiles.models import Profile
from accounts.models import User


class Command(BaseCommand):
    """
    Wipes every piece of customer/business data for a clean local testing
    environment, while leaving admin/superuser accounts, migrations, and the
    schema itself completely untouched.

    Deletion order matters here for exactly two reasons:

    1. orders.Order.customer is on_delete=PROTECT — a customer with an order
       can't be deleted until that order is gone, so Orders are deleted
       first. (OrderItem/Transaction cascade automatically from Order.)

    2. analytics.TapEvent's `card`/`customer` FKs are on_delete=SET_NULL, not
       CASCADE — deleting a card or customer would silently leave the log
       row behind with a null FK instead of removing it, so TapEvent is
       deleted explicitly.

    Every other business-data model — Profile (-> SocialLink, CustomLink,
    CustomField, CustomerQrCode), SupportTicket (-> TicketMessage), Lead,
    Notification, CustomerSettings, CustomerService,
    customer_management.customer_orders.Order (-> its own OrderItem,
    OrderStatusHistory), customer_management.customer_analytics.
    AnalyticsEvent, and EmailOTP — is on_delete=CASCADE from
    accounts.User (directly or transitively), so deleting the non-admin
    User rows removes all of it in one pass; there is nothing left to
    orphan and nothing to delete twice.

    NfcCard.user is on_delete=SET_NULL: cards are physical inventory, not
    business data to erase, so they are reset to UNASSIGNED (user cleared,
    status/assigned_on/activated_on reset) rather than deleted — the
    uid/serial_number/card_type/color/purchase_date rows survive intact.
    """

    help = (
        "Deletes all customers, orders, profiles, analytics, support tickets, "
        "notifications, leads, and resets every NFC card's assignment, while "
        "preserving admin/superuser accounts. For local development databases "
        "only — refuses to run unless DEBUG=True."
    )

    def add_arguments(self, parser):
        parser.add_argument(
            "--yes",
            action="store_true",
            help="Skip the interactive confirmation prompt.",
        )

    def handle(self, *args, **options):
        if not settings.DEBUG:
            raise CommandError(
                "Refusing to run: DEBUG is False. reset_dev_data is for local "
                "development databases only, never a real deployment."
            )

        if not options["yes"]:
            confirm = input(
                "This permanently deletes ALL customers, orders, profiles, "
                "analytics, support tickets, notifications, and leads, and "
                "resets every NFC card to UNASSIGNED. Admin/superuser accounts "
                "are preserved. Migrations and schema are untouched.\n"
                "Type 'yes' to continue: "
            )
            if confirm.strip().lower() != "yes":
                self.stdout.write(self.style.WARNING("Aborted — no changes made."))
                return

        with transaction.atomic():
            order_count = Order.objects.count()
            Order.objects.all().delete()

            tap_event_count = TapEvent.objects.count()
            TapEvent.objects.all().delete()

            # role="ADMIN" is this app's own convention; is_staff/is_superuser
            # are checked too so no account that Django itself considers an
            # admin can ever be caught by this, regardless of how it was
            # created (createsuperuser vs role=ADMIN via the API).
            customers_qs = User.objects.exclude(
                Q(role="ADMIN") | Q(is_staff=True) | Q(is_superuser=True)
            )
            customer_count = customers_qs.count()
            profile_count = Profile.objects.filter(user__in=customers_qs).count()
            customers_qs.delete()

            cards_qs = NfcCard.objects.exclude(status=NfcCard.Status.UNASSIGNED)
            reset_card_count = cards_qs.count()
            cards_qs.update(
                user=None,
                status=NfcCard.Status.UNASSIGNED,
                assigned_on=None,
                activated_on=None,
            )

        admin_count = User.objects.count()

        self.stdout.write(self.style.SUCCESS("\nDatabase reset complete.\n"))
        self.stdout.write("Deleted:")
        self.stdout.write(f"  Customers (and everything CASCADE-owned by them): {customer_count}")
        self.stdout.write(f"  Orders (+ order items + transactions):            {order_count}")
        self.stdout.write(f"  Profiles (+ social/custom links + QR records):    {profile_count}")
        self.stdout.write(f"  Analytics tap events:                             {tap_event_count}")
        self.stdout.write("")
        self.stdout.write("Reset (not deleted — physical inventory):")
        self.stdout.write(f"  NFC cards set back to UNASSIGNED:                 {reset_card_count}")
        self.stdout.write("")
        self.stdout.write(f"Preserved: {admin_count} admin/superuser account(s).")
