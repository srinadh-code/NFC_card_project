from django.db import transaction
from django.db.models import Q
from django.utils import timezone
from rest_framework.views import APIView
from rest_framework.exceptions import ValidationError

from accounts.models import User
from admin_api.permissions import IsAdminRole
from common.pagination import StandardPagination
from common.response import error, success
from nfc_cards.models import NfcCard
from nfc_cards.assignment import assignment_accounts, assignment_recipient, eligible_assignment_recipients, normalize_assignment_email
from orders.models import Order, OrderRecipient

from .serializers import (
    AdminCardAssignSerializer,
    AdminCardWriteSerializer,
    NfcCardAdminSerializer,
    generate_uid,
)


def _resolve_customer(email, *, existing_card=None, recipient_id=None):
    """`email` has already passed AdminCardWriteSerializer/AdminCardAssignSerializer
    validation, so a blank string means "no customer" and any other value is
    guaranteed to match an existing CUSTOMER account."""
    if not email:
        return None
    matches = assignment_accounts(email).filter(role=User.Role.CUSTOMER).order_by("pk")
    if recipient_id is not None:
        recipient = OrderRecipient.objects.filter(pk=recipient_id, user__in=matches).select_related("user").first()
        if recipient is None:
            raise ValidationError({"customer_email": "Choose a recipient belonging to this email identity."})
        return recipient.user
    customer = matches.filter(pk=existing_card.user_id).first() if existing_card and existing_card.user_id else None
    customer = customer or matches.first()
    if customer is None:
        raise ValidationError({"customer_email": "No customer account found with that email."})
    return customer


def _assign_paid_card(card, customer, recipient_id=None):
    from admin_api.orders.services import assign_card_to_order

    try:
        recipient = assignment_recipient(customer, card.card_type, recipient_id)
        assign_card_to_order(recipient.order, card, recipient_id=recipient.pk)
    except ValueError as exc:
        raise ValidationError({"customer_email": str(exc)}) from exc
    card.refresh_from_db()


class AdminCardAssignmentCustomerListView(APIView):
    """Assignment-only lookup; the normal Customers directory is unchanged."""

    permission_classes = [IsAdminRole]

    def get(self, request):
        card_type = request.query_params.get("card_type", NfcCard.CardType.CUSTOM).strip().upper()
        if card_type not in NfcCard.CardType.values:
            return error("Choose a valid card product.", status=400)
        available = eligible_assignment_recipients(card_type=card_type)
        search = request.query_params.get("search", "").strip()
        if search:
            available = [r for r in available if search.casefold() in r.user.full_name.casefold() or search.casefold() in r.user.email.casefold()]
        paginator = StandardPagination()
        page = paginator.paginate_queryset(available, request)
        return paginator.get_paginated_response([
            {"id": recipient.user_id, "name": recipient.user.full_name, "email": normalize_assignment_email(recipient.user.email),
             "recipient_id": recipient.pk, "order_id": recipient.order_id, "card_type": card_type}
            for recipient in page
        ])


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
        card_type = request.query_params.get("card_type", "").strip().upper()
        if card_type:
            if card_type not in NfcCard.CardType.values:
                return error("Choose a valid card product.", status=400)
            qs = qs.filter(card_type=card_type)

        paginator = StandardPagination()
        page = paginator.paginate_queryset(qs, request)
        return paginator.get_paginated_response(NfcCardAdminSerializer(page, many=True).data)

    @transaction.atomic
    def post(self, request):
        serializer = AdminCardWriteSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data

        customer = _resolve_customer(data.get("customer_email", ""), recipient_id=data.get("recipient_id"))
        status_value = data.get("status", NfcCard.Status.ASSIGNED if customer else NfcCard.Status.UNASSIGNED)
        if (customer and status_value == NfcCard.Status.UNASSIGNED) or (not customer and status_value in (NfcCard.Status.ASSIGNED, NfcCard.Status.ACTIVE)):
            return error("Assigned or active cards require a paid recipient allocation.", status=400)

        card = NfcCard.objects.create(
            uid=data.get("uid") or generate_uid(),
            serial_number=data.get("serial_number") or NfcCard.generate_serial_number(),
            card_type=data.get("card_type", NfcCard.CardType.CUSTOM),
            color=data.get("color", "Black"),
            user=None,
            status=NfcCard.Status.UNASSIGNED if customer else status_value,
            purchase_date=data.get("purchase_date"),
            notes=data.get("notes", ""),
        )
        if customer:
            _assign_paid_card(card, customer, data.get("recipient_id"))
            if status_value != card.status:
                card.status = status_value
                if status_value == NfcCard.Status.ACTIVE:
                    card.activated_on = timezone.now()
                card.save(update_fields=["status", "activated_on", "updated_at"])
        return success(NfcCardAdminSerializer(card).data, message="Card added.", status=201)


class AdminCardDetailView(APIView):
    permission_classes = [IsAdminRole]

    @transaction.atomic
    def patch(self, request, pk):
        card = NfcCard.objects.filter(pk=pk).first()
        if card is None:
            return error("Card not found.", status=404)

        serializer = AdminCardWriteSerializer(data=request.data, existing_card=card, partial=True)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data
        proposed_owner = _resolve_customer(data["customer_email"], existing_card=card, recipient_id=data.get("recipient_id")) if "customer_email" in data else card.user
        if proposed_owner is not None and proposed_owner.pk != card.user_id:
            try:
                recipient = assignment_recipient(proposed_owner, data.get("card_type", card.card_type), data.get("recipient_id"))
            except ValueError as exc:
                raise ValidationError({"customer_email": str(exc)}) from exc
            Order.objects.select_for_update().get(pk=recipient.order_id)
        card = NfcCard.objects.select_for_update().get(pk=card.pk)
        linked = OrderRecipient.objects.filter(assigned_card=card).exists() or Order.objects.filter(assigned_card=card).exists()
        new_owner = _resolve_customer(data["customer_email"], existing_card=card, recipient_id=data.get("recipient_id")) if "customer_email" in data else card.user
        if data.get("card_type", card.card_type) != card.card_type and (linked or card.user_id):
            return error("An assigned card's product cannot be changed.", status=400)
        if linked and ((new_owner.pk if new_owner else None) != card.user_id or data.get("status") == NfcCard.Status.UNASSIGNED):
            return error("This card belongs to an order allocation; its recipient cannot be changed here.", status=400)
        if new_owner is not None and new_owner.pk != card.user_id:
            if card.user_id or card.status != NfcCard.Status.UNASSIGNED or data.get("status") == NfcCard.Status.UNASSIGNED:
                return error("Assign an available inventory card to a paid recipient allocation.", status=400)
            if "card_type" in data:
                card.card_type = data["card_type"]
                card.save(update_fields=["card_type", "updated_at"])
            _assign_paid_card(card, new_owner, data.get("recipient_id"))

        update_fields = []
        for field in ("uid", "serial_number", "card_type", "color", "status", "purchase_date", "notes"):
            if field in data:
                setattr(card, field, data[field])
                update_fields.append(field)

        if "customer_email" in data:
            card.user = new_owner
            update_fields.append("user")

        if update_fields:
            card.save(update_fields=[*update_fields, "updated_at"])

        return success(NfcCardAdminSerializer(card).data, message="Card updated.")

    @transaction.atomic
    def delete(self, request, pk):
        card = NfcCard.objects.select_for_update().filter(pk=pk).first()
        if card is None:
            return error("Card not found.", status=404)
        card.delete()
        return success(message="Card deleted.")


class AdminCardAssignView(APIView):
    """Quick-action: assign a card to a customer by email, always moving it to Assigned."""

    permission_classes = [IsAdminRole]

    @transaction.atomic
    def post(self, request, pk):
        # The central service acquires the order and card locks in that order.
        card = NfcCard.objects.filter(pk=pk).first()
        if card is None:
            return error("Card not found.", status=404)

        serializer = AdminCardAssignSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        customer = _resolve_customer(serializer.validated_data["email"], existing_card=card, recipient_id=serializer.validated_data.get("recipient_id"))
        if card.user_id == customer.pk and card.status != NfcCard.Status.UNASSIGNED:
            return success(NfcCardAdminSerializer(card).data, message="Card is already assigned to this customer.")
        if card.user_id is not None or card.status != NfcCard.Status.UNASSIGNED:
            return error("This card is not available for assignment.", status=400)
        if OrderRecipient.objects.filter(assigned_card=card).exists() or Order.objects.filter(assigned_card=card).exists():
            return error("This card already fulfils an order allocation.", status=400)

        _assign_paid_card(card, customer, serializer.validated_data.get("recipient_id"))
        return success(NfcCardAdminSerializer(card).data, message="Card assigned to customer.")


class AdminCardActivateView(APIView):
    """Admin force-activation — distinct from the customer's own activate-by-uid flow."""

    permission_classes = [IsAdminRole]

    @transaction.atomic
    def post(self, request, pk):
        card = NfcCard.objects.select_for_update().filter(pk=pk).first()
        if card is None:
            return error("Card not found.", status=404)

        if card.user_id is None:
            return error("Assign this card to a recipient before activation.", status=400)
        card.status = NfcCard.Status.ACTIVE
        card.activated_on = card.activated_on or timezone.now()
        card.save(update_fields=["status", "activated_on", "updated_at"])
        return success(NfcCardAdminSerializer(card).data, message="Card activated.")


class AdminCardBlockView(APIView):
    permission_classes = [IsAdminRole]

    @transaction.atomic
    def post(self, request, pk):
        card = NfcCard.objects.select_for_update().filter(pk=pk).first()
        if card is None:
            return error("Card not found.", status=404)

        card.status = NfcCard.Status.BLOCKED
        card.save(update_fields=["status", "updated_at"])
        return success(NfcCardAdminSerializer(card).data, message="Card blocked.")


class AdminCardMarkLostView(APIView):
    permission_classes = [IsAdminRole]

    @transaction.atomic
    def post(self, request, pk):
        card = NfcCard.objects.select_for_update().filter(pk=pk).first()
        if card is None:
            return error("Card not found.", status=404)

        card.status = NfcCard.Status.LOST
        card.save(update_fields=["status", "updated_at"])
        return success(NfcCardAdminSerializer(card).data, message="Card marked as lost.")
