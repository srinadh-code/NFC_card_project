from django.db.models import Prefetch

from accounts.roles import recipient_condition
from orders.models import Order, OrderRecipient
from profiles.models import Profile


def customer_profiles():
    """The admin Customers directory: profiles of RECIPIENT accounts
    (accounts/roles.py). Buyer-only identities from checkouts for other
    people are excluded; no historical data is deleted or relabelled — a
    purchaser's existing profile simply stays out of the directory. A
    legacy, card-holding or customized profile remains a customer."""
    return Profile.objects.select_related("user", "user__onboarding").filter(
        recipient_condition("user_id")
    ).prefetch_related("user__nfc_cards", "user__orders", Prefetch("user__order_recipients", queryset=OrderRecipient.objects.filter(order__payment_status=Order.PaymentStatus.PAID).select_related("assigned_card", "profile", "user__onboarding")))

