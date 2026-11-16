"""Owner-scoped Google Review settings and real, product-separated scan events."""
from datetime import timedelta

from django.core.exceptions import ValidationError
from django.db import transaction
from django.db.models import Count, Exists, OuterRef, Q
from django.utils import timezone
from rest_framework import serializers
from rest_framework.views import APIView

from accounts.roles import is_recipient
from analytics.models import TapEvent
from analytics.tracking import _device_from_user_agent, _visitor_hash
from common.card_products import DIGITAL_CARD_TYPES, recipient_card_type
from common.permissions import IsCustomerRole
from common.response import error, success
from orders.models import Order, OrderRecipient, Transaction
from profiles.models import Profile

from .models import NfcCard
from .serializers import NfcCardSerializer
from .review_urls import validate_review_url


def product_access(user):
    if not getattr(user, "is_authenticated", False) or user.role != "CUSTOMER":
        return False, False
    cards = NfcCard.objects.filter(user=user)
    paid = OrderRecipient.objects.filter(user=user, order__payment_status=Order.PaymentStatus.PAID).exclude(
        order__status=Order.Status.CANCELLED
    ).annotate(_paid_ledger=Exists(Transaction.objects.filter(
        order_id=OuterRef("order_id"), status=Order.PaymentStatus.PAID,
    ))).select_related("order", "assigned_card").prefetch_related("order__items")
    rows = list(paid)
    types = {recipient_card_type(row) for row in rows}
    review = any(recipient_card_type(row) == "REVIEW" and row._paid_ledger for row in rows) or cards.filter(card_type="REVIEW").exists()
    digital = bool(types.intersection(DIGITAL_CARD_TYPES)) or cards.filter(card_type__in=DIGITAL_CARD_TYPES).exists()
    # Review configuration itself must never manufacture digital entitlement.
    digital = digital or Profile.objects.filter(user=user).filter(
        Q(company__gt="") | Q(designation__gt="") | Q(bio__gt="") | Q(website__gt="") |
        Q(address__gt="") | Q(avatar__gt="") | Q(cover_image__gt="") |
        ~Q(selected_template="classic") |
        Q(social_links__enabled=True, social_links__url__gt="") |
        Q(custom_links__enabled=True, custom_links__url__gt="") | Q(custom_fields__value__gt="")
    ).exists()
    if "REVIEW" not in types and not cards.filter(card_type="REVIEW").exists():
        digital = digital or is_recipient(user)
    if not digital:
        digital = Order.objects.filter(customer=user, payment_status=Order.PaymentStatus.PAID, recipients__isnull=True,
                                       items__card_type__in=DIGITAL_CARD_TYPES).exists()
    return review, bool(digital)


class GoogleReviewSettingsSerializer(serializers.Serializer):
    business_name = serializers.CharField(max_length=150, allow_blank=True, required=False)
    google_review_url = serializers.CharField(max_length=2048, allow_blank=True, required=False)

    def validate_google_review_url(self, value):
        try:
            return validate_review_url(value, expand_short_links=True)
        except ValidationError as exc:
            raise serializers.ValidationError(exc.messages) from None


def _workspace(user, *, eligible, digital):
    cards = list(NfcCard.objects.filter(user=user, card_type="REVIEW")) if eligible else []
    profile = Profile.objects.filter(user=user).first() if eligible else None
    destination = profile.google_review_url if profile else ""
    try:
        configured = bool(destination and validate_review_url(destination))
    except ValidationError:
        configured = False
    chosen = next((card for card in cards if card.status == NfcCard.Status.ACTIVE), cards[0] if cards else None)
    scan_url = (chosen.programming_url or "") if chosen else ""
    totals = TapEvent.objects.filter(customer=user).aggregate(
        taps=Count("pk", filter=Q(action=TapEvent.Action.REVIEW_TAP)),
        qr_scans=Count("pk", filter=Q(action=TapEvent.Action.REVIEW_QR_SCAN)),
    ) if eligible else {"taps": 0, "qr_scans": 0}
    return {
        "eligible": eligible, "digital_access": digital,
        "business_name": profile.google_review_business_name if profile else "",
        "google_review_url": destination,
        "configured": configured,
        "cards": NfcCardSerializer(cards, many=True).data,
        "scan_url": scan_url, "qr_url": scan_url,
        "stats": {**totals, "total": totals["taps"] + totals["qr_scans"]},
    }


class GoogleReviewWorkspaceView(APIView):
    permission_classes = [IsCustomerRole]

    def get(self, request):
        eligible, digital = product_access(request.user)
        return success(_workspace(request.user, eligible=eligible, digital=digital))

    def patch(self, request):
        eligible, digital = product_access(request.user)
        if not eligible:
            return error("A paid Google Review recipient allocation is required.", status=403)
        serializer = GoogleReviewSettingsSerializer(data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        profile = Profile.ensure_for_user(request.user)
        updates = []
        for source, target in (("business_name", "google_review_business_name"), ("google_review_url", "google_review_url")):
            if source in serializer.validated_data:
                setattr(profile, target, serializer.validated_data[source])
                updates.append(target)
        if updates:
            profile.save(update_fields=[*updates, "updated_at"])
        # Product access is derived before the settings write, never from a review destination.
        return success(_workspace(request.user, eligible=eligible, digital=digital), message="Google Review settings updated.")


@transaction.atomic
def resolve_review_card(request, card):
    # Serialize the short duplicate window across workers without changing
    # the existing digital event path or introducing another cache backend.
    card = NfcCard.objects.select_for_update(of=("self",)).select_related("user").get(pk=card.pk)
    if card.status != NfcCard.Status.ACTIVE or card.user_id is None:
        return error("This review card is not active.", status=404)
    if not card.user.is_active or card.user.must_change_password:
        return error("This review card is not active.", status=404)
    profile = Profile.objects.filter(user_id=card.user_id).first()
    if profile is None or not profile.google_review_url:
        return error("This review card has not been configured.", status=404)
    try:
        destination = validate_review_url(profile.google_review_url)
    except ValidationError:
        return error("This review card has not been configured.", status=404)
    action = TapEvent.Action.REVIEW_QR_SCAN if request.query_params.get("source") == "qr" else TapEvent.Action.REVIEW_TAP
    visitor = _visitor_hash(request)
    recent = TapEvent.objects.filter(card=card, action=action, visitor_hash=visitor,
                                     created_at__gte=timezone.now() - timedelta(seconds=10)).exists()
    if not recent:
        TapEvent.objects.create(card=card, customer=card.user, action=action, visitor_hash=visitor,
                                device=_device_from_user_agent(request.META.get("HTTP_USER_AGENT", "")))
    return success({"redirect_url": destination})
