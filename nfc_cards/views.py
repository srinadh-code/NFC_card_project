from django.utils import timezone
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.views import APIView

from analytics.models import TapEvent
from analytics.tracking import log_event
from common.response import error, success

from .models import NfcCard
from .serializers import ActivateCardSerializer, NfcCardSerializer, TrackEventSerializer


class MyCardsView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        cards = NfcCard.objects.filter(user=request.user)
        return success(NfcCardSerializer(cards, many=True).data)


class ActivateCardView(APIView):
    """Customer claims a physical card by entering/scanning its UID."""

    permission_classes = [IsAuthenticated]

    def post(self, request):
        serializer = ActivateCardSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        uid = serializer.validated_data["uid"].strip()

        card = NfcCard.objects.filter(uid__iexact=uid).first()
        if card is None:
            return error("No card found with that ID.", status=404)

        if card.user_id is not None and card.user_id != request.user.id:
            return error("This card is already claimed by another account.", status=400)

        if card.status == NfcCard.Status.BLOCKED:
            return error("This card has been blocked. Contact support.", status=400)
        if card.status == NfcCard.Status.LOST:
            return error("This card was reported lost. Contact support.", status=400)

        now = timezone.now()
        card.user = request.user
        card.status = NfcCard.Status.ACTIVE
        if not card.assigned_on:
            card.assigned_on = now
        card.activated_on = now
        card.save(update_fields=["user", "status", "assigned_on", "activated_on", "updated_at"])

        return success(NfcCardSerializer(card).data, message="Card activated.")


class ActivateAssignedCardView(APIView):
    """One-click activation for a card the admin already assigned to this customer."""

    permission_classes = [IsAuthenticated]

    def post(self, request, pk):
        card = NfcCard.objects.filter(pk=pk).first()
        if card is None:
            return error("Card not found.", status=404)
        if card.user_id != request.user.id:
            return error("This card is not assigned to your account.", status=403)
        if card.status != NfcCard.Status.ASSIGNED:
            return error("This card is not in an assignable state.", status=400)

        card.status = NfcCard.Status.ACTIVE
        card.activated_on = timezone.now()
        card.save(update_fields=["status", "activated_on", "updated_at"])

        return success(NfcCardSerializer(card).data, message="Card activated.")


class CardResolveView(APIView):
    """
    Public endpoint an NFC tap / QR scan hits first. Resolves a card to its
    owner's public profile URL only — never exposes any other card or
    customer data.

    Optional `?source=qr` distinguishes a QR-code scan from a plain NFC tap
    for analytics — a caller that omits it is assumed to be a direct NFC
    tap, since that's this endpoint's primary trigger.
    """

    permission_classes = [AllowAny]

    def get(self, request, identifier):
        card = NfcCard.objects.filter(uid__iexact=identifier).first()
        if card is None and identifier.isdigit():
            card = NfcCard.objects.filter(pk=int(identifier)).first()

        if card is None or card.status not in (NfcCard.Status.ACTIVE, NfcCard.Status.ASSIGNED):
            return error("This card is not active.", status=404)

        profile = getattr(card.user, "profile", None) if card.user_id else None
        if profile is None or not profile.profile_public:
            return error("This card's profile is not available.", status=404)

        action = TapEvent.Action.QR_SCAN if request.query_params.get("source") == "qr" else TapEvent.Action.TAP
        log_event(request, action=action, card=card, customer=card.user)

        return success({"redirect_url": profile.public_url_path})


class TrackEventView(APIView):
    """Public engagement tracking for actions that happen entirely
    client-side after a card has already resolved (saving the contact,
    sharing the profile) — see analytics.tracking.log_event."""

    permission_classes = [AllowAny]

    def post(self, request):
        serializer = TrackEventSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data

        card = NfcCard.objects.filter(uid__iexact=data["uid"]).first()
        if card is None:
            return error("No card found with that ID.", status=404)

        action_map = {
            "contact_saved": TapEvent.Action.CONTACT_SAVED,
            "shared": TapEvent.Action.SHARED,
        }
        log_event(request, action=action_map[data["action"]], card=card, customer=card.user)
        return success(message="Recorded.")
