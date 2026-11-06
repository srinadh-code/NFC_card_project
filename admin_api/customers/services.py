from django.db.models import Exists, OuterRef, Prefetch, Q

from accounts.models import User
from orders.models import Order, OrderRecipient
from profiles.models import CustomField, CustomLink, Profile, SocialLink


def customer_profiles():
    """Preserve legacy profile customers while excluding explicit buyer-only
    identities introduced by checkouts for other people. No historical data
    is deleted or relabelled to make the directory filter work.
    """
    explicit_purchases = Order.objects.filter(customer_id=OuterRef("user_id"), payment_status=Order.PaymentStatus.PAID, recipients__isnull=False)
    recipient_allocations = OrderRecipient.objects.filter(user_id=OuterRef("user_id"), order__payment_status=Order.PaymentStatus.PAID)
    legacy_purchases = Order.objects.filter(customer_id=OuterRef("user_id"), payment_status=Order.PaymentStatus.PAID, recipients__isnull=True)
    return Profile.objects.select_related("user", "user__onboarding").annotate(
        _explicit_purchaser=Exists(explicit_purchases),
        _paid_recipient=Exists(recipient_allocations),
        _legacy_customer=Exists(legacy_purchases),
        _has_social=Exists(SocialLink.objects.filter(profile_id=OuterRef("pk"), enabled=True).exclude(url="")),
        _has_links=Exists(CustomLink.objects.filter(profile_id=OuterRef("pk"), enabled=True).exclude(url="")),
        _has_fields=Exists(CustomField.objects.filter(profile_id=OuterRef("pk")).exclude(value="")),
    ).filter(user__role=User.Role.CUSTOMER).filter(
        Q(_explicit_purchaser=False) | Q(_paid_recipient=True) | Q(_legacy_customer=True) | Q(user__nfc_cards__isnull=False)
        # A previously customized business profile is also a legitimate
        # customer association, even when its owner later buys for others.
        | Q(company__gt="") | Q(designation__gt="") | Q(bio__gt="") | Q(website__gt="")
        | Q(address__gt="") | Q(google_review_url__gt="")
        | Q(avatar__gt="") | Q(cover_image__gt="")
        | Q(_has_social=True) | Q(_has_links=True) | Q(_has_fields=True)
    ).distinct().prefetch_related("user__nfc_cards", "user__orders", Prefetch("user__order_recipients", queryset=OrderRecipient.objects.filter(order__payment_status=Order.PaymentStatus.PAID).select_related("assigned_card", "profile", "user__onboarding")))

