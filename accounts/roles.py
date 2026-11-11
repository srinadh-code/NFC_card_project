"""Purchaser / recipient roles for CUSTOMER accounts.

One login (`User.role == CUSTOMER`) can hold either or both roles. They are
derived from existing records rather than stored, so they always match the
orders and cards themselves and need no migration:

* PURCHASER — owns at least one order (``Order.customer``).
* RECIPIENT — may use the Customer Dashboard and digital profile. Every
  customer account except a purchaser-only one: an account that paid for
  cards for other people is a recipient only if it also holds a card (a
  paid recipient allocation — ``OrderRecipient.user``, linked by
  accounts.onboarding when the order is paid — or an NFC card), has a
  legacy paid order from before recipient rows existed, or has a profile
  it customized. This is the rule the admin Customers directory already
  used (admin_api.customers.services); accounts with no paid
  purchase-for-others keep the access they always had.

Buying cards for other people therefore never grants the digital-profile
side. When a purchaser later enters their own email as a recipient, payment
links that allocation to the same account and the RECIPIENT role appears —
same user, same password, no duplicate account.
"""

from django.db.models import Exists, OuterRef, Q

from .models import User

PURCHASER = "PURCHASER"
RECIPIENT = "RECIPIENT"


def customized_profile_condition():
    """Q on a Profile queryset: the profile has customer-entered content."""
    from profiles.models import CustomField, CustomLink, SocialLink

    return (
        Q(company__gt="") | Q(designation__gt="") | Q(bio__gt="") | Q(website__gt="")
        | Q(address__gt="") | Q(google_review_url__gt="")
        | Q(avatar__gt="") | Q(cover_image__gt="")
        | Q(Exists(SocialLink.objects.filter(profile_id=OuterRef("pk"), enabled=True).exclude(url="")))
        | Q(Exists(CustomLink.objects.filter(profile_id=OuterRef("pk"), enabled=True).exclude(url="")))
        | Q(Exists(CustomField.objects.filter(profile_id=OuterRef("pk")).exclude(value="")))
    )


def recipient_condition(user_field="pk"):
    """Q matching RECIPIENT accounts. ``user_field`` names the user id in the
    queryset being filtered: "pk" for User, "user_id" for Profile."""
    from nfc_cards.models import NfcCard
    from orders.models import Order, OrderRecipient
    from profiles.models import Profile

    user_ref = OuterRef(user_field)
    paid = Order.PaymentStatus.PAID
    allocated = Exists(OrderRecipient.objects.filter(user_id=user_ref, order__payment_status=paid))
    has_card = Exists(NfcCard.objects.filter(user_id=user_ref))
    legacy_order = Exists(Order.objects.filter(customer_id=user_ref, payment_status=paid, recipients__isnull=True))
    bought_for_others = Exists(Order.objects.filter(customer_id=user_ref, payment_status=paid, recipients__isnull=False))
    customized = Exists(Profile.objects.filter(user_id=user_ref).filter(customized_profile_condition()))
    role = Q(role=User.Role.CUSTOMER) if user_field == "pk" else Q(user__role=User.Role.CUSTOMER)
    return role & Q(
        ~Q(bought_for_others) | Q(allocated) | Q(has_card) | Q(legacy_order) | Q(customized)
    )


def recipient_users():
    return User.objects.filter(recipient_condition())


def is_recipient(user):
    if not getattr(user, "is_authenticated", False) or user.role != User.Role.CUSTOMER:
        return False
    # Not cached on the user object: the same object can outlive the moment
    # a recipient allocation is linked, and this is a single EXISTS query.
    return recipient_users().filter(pk=user.pk).exists()


def is_purchaser(user):
    if not getattr(user, "is_authenticated", False) or user.role != User.Role.CUSTOMER:
        return False
    return user.orders.exists()


def roles_for(user):
    roles = []
    if is_purchaser(user):
        roles.append(PURCHASER)
    if is_recipient(user):
        roles.append(RECIPIENT)
    return roles
