from django.db.models import Q
from django.utils import timezone
from rest_framework.views import APIView

from accounts.models import User
from admin_api.permissions import IsAdminRole
from common.pagination import StandardPagination
from common.response import error, success
from nfc_cards.models import NfcCard

from .serializers import (
    AdminCardAssignSerializer,
    AdminCardWriteSerializer,
    NfcCardAdminSerializer,
    generate_uid,
)


def _resolve_customer(email):
    """`email` has already passed AdminCardWriteSerializer/AdminCardAssignSerializer
    validation, so a blank string means "no customer" and any other value is
    guaranteed to match an existing CUSTOMER account."""
    if not email:
        return None
    return User.objects.get(email=email, role=User.Role.CUSTOMER)


class AdminCardListCreateView(APIView):
    permission_classes = [IsAdminRole]

    def get(self, request):
        qs = NfcCard.objects.select_related("user").all()

        search = request.query_params.get("search", "").strip()
        if search:
            search_filter = (
                Q(uid__icontains=search)
                | Q(serial_number__icontains=search)
                | Q(user__full_name__icontains=search)
            )
            if search.isdigit():
                search_filter |= Q(id=int(search))
            qs = qs.filter(search_filter)

        status_param = request.query_params.get("status", "").strip().upper()
        if status_param and status_param in NfcCard.Status.values:
            qs = qs.filter(status=status_param)

        paginator = StandardPagination()
        page = paginator.paginate_queryset(qs, request)
        return paginator.get_paginated_response(NfcCardAdminSerializer(page, many=True).data)

    def post(self, request):
        serializer = AdminCardWriteSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data

        customer = _resolve_customer(data.get("customer_email", ""))
        status_value = data.get("status", NfcCard.Status.UNASSIGNED)
        now = timezone.now()

        card = NfcCard.objects.create(
            uid=data.get("uid") or generate_uid(),
            serial_number=data.get("serial_number") or NfcCard.generate_serial_number(),
            card_type=data.get("card_type", NfcCard.CardType.CLASSIC),
            color=data.get("color", "Black"),
            user=customer,
            status=status_value,
            assigned_on=now if customer else None,
            activated_on=now if status_value == NfcCard.Status.ACTIVE else None,
            purchase_date=data.get("purchase_date"),
            notes=data.get("notes", ""),
        )
        return success(NfcCardAdminSerializer(card).data, message="Card added.", status=201)


class AdminCardDetailView(APIView):
    permission_classes = [IsAdminRole]

    def patch(self, request, pk):
        card = NfcCard.objects.filter(pk=pk).first()
        if card is None:
            return error("Card not found.", status=404)

        serializer = AdminCardWriteSerializer(data=request.data, existing_card=card, partial=True)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data

        update_fields = []
        for field in ("uid", "serial_number", "card_type", "color", "status", "purchase_date", "notes"):
            if field in data:
                setattr(card, field, data[field])
                update_fields.append(field)

        if "customer_email" in data:
            card.user = _resolve_customer(data["customer_email"])
            update_fields.append("user")

        if update_fields:
            card.save(update_fields=[*update_fields, "updated_at"])

        return success(NfcCardAdminSerializer(card).data, message="Card updated.")

    def delete(self, request, pk):
        card = NfcCard.objects.filter(pk=pk).first()
        if card is None:
            return error("Card not found.", status=404)
        card.delete()
        return success(message="Card deleted.")


class AdminCardAssignView(APIView):
    """Quick-action: assign a card to a customer by email, always moving it to Assigned."""

    permission_classes = [IsAdminRole]

    def post(self, request, pk):
        card = NfcCard.objects.filter(pk=pk).first()
        if card is None:
            return error("Card not found.", status=404)

        serializer = AdminCardAssignSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        customer = _resolve_customer(serializer.validated_data["email"])

        card.user = customer
        card.status = NfcCard.Status.ASSIGNED
        card.assigned_on = timezone.now()
        card.save(update_fields=["user", "status", "assigned_on", "updated_at"])
        return success(NfcCardAdminSerializer(card).data, message="Card assigned to customer.")


class AdminCardActivateView(APIView):
    """Admin force-activation — distinct from the customer's own activate-by-uid flow."""

    permission_classes = [IsAdminRole]

    def post(self, request, pk):
        card = NfcCard.objects.filter(pk=pk).first()
        if card is None:
            return error("Card not found.", status=404)

        card.status = NfcCard.Status.ACTIVE
        card.activated_on = timezone.now()
        card.save(update_fields=["status", "activated_on", "updated_at"])
        return success(NfcCardAdminSerializer(card).data, message="Card activated.")


class AdminCardBlockView(APIView):
    permission_classes = [IsAdminRole]

    def post(self, request, pk):
        card = NfcCard.objects.filter(pk=pk).first()
        if card is None:
            return error("Card not found.", status=404)

        card.status = NfcCard.Status.BLOCKED
        card.save(update_fields=["status", "updated_at"])
        return success(NfcCardAdminSerializer(card).data, message="Card blocked.")


class AdminCardMarkLostView(APIView):
    permission_classes = [IsAdminRole]

    def post(self, request, pk):
        card = NfcCard.objects.filter(pk=pk).first()
        if card is None:
            return error("Card not found.", status=404)

        card.status = NfcCard.Status.LOST
        card.save(update_fields=["status", "updated_at"])
        return success(NfcCardAdminSerializer(card).data, message="Card marked as lost.")
