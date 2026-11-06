from django.db.models import Count, DecimalField, F, IntegerField, Max, OuterRef, Prefetch, Q, Subquery, Sum, Value
from django.db.models.functions import Coalesce
from rest_framework.views import APIView

from accounts.models import User
from admin_api.permissions import IsAdminRole
from common.pagination import StandardPagination
from common.response import error, success
from orders.models import Order, OrderItem, OrderRecipient

from .serializers import AdminPurchaserDetailSerializer, AdminPurchaserSerializer


def purchaser_queryset():
    # Keep each aggregate isolated: joining items and recipients together would
    # multiply both purchased quantities and payment totals for bulk orders.
    paid = Order.objects.filter(customer_id=OuterRef("pk"), payment_status=Order.PaymentStatus.PAID).order_by()
    items = OrderItem.objects.filter(order__customer_id=OuterRef("pk"), order__payment_status=Order.PaymentStatus.PAID).order_by()
    recipients = OrderRecipient.objects.filter(order__customer_id=OuterRef("pk"), order__payment_status=Order.PaymentStatus.PAID).order_by()
    money = DecimalField(max_digits=14, decimal_places=2)

    def integer_total(query, group, aggregate):
        return Coalesce(Subquery(query.values(group).annotate(value=aggregate).values("value")[:1], output_field=IntegerField()), Value(0))

    # Older orders used the parent's assigned_card rather than recipient slots.
    legacy = paid.filter(recipients__isnull=True, assigned_card__isnull=False)
    latest = paid.order_by("-placed_at", "-pk")
    return User.objects.annotate(
        latest_purchaser_name=Subquery(latest.exclude(purchaser_name="").values("purchaser_name")[:1]),
        latest_purchaser_phone=Subquery(latest.exclude(purchaser_phone="").values("purchaser_phone")[:1]),
        paid_order_count=integer_total(paid, "customer_id", Count("pk")),
        total_cards_purchased=integer_total(items, "order__customer_id", Sum("qty")),
        total_amount_paid=Coalesce(Subquery(paid.values("customer_id").annotate(value=Sum(F("amount") + F("shipping"), output_field=money)).values("value")[:1], output_field=money), Value(0, output_field=money)),
        last_purchase_date=Subquery(paid.values("customer_id").annotate(value=Max("placed_at")).values("value")[:1]),
        total_cards_assigned=integer_total(recipients.filter(assigned_card__isnull=False), "order__customer_id", Count("assigned_card_id", distinct=True)) + integer_total(legacy, "customer_id", Count("assigned_card_id", distinct=True)),
        total_cards_activated=integer_total(recipients.filter(assigned_card__status="ACTIVE"), "order__customer_id", Count("assigned_card_id", distinct=True)) + integer_total(legacy.filter(assigned_card__status="ACTIVE"), "customer_id", Count("assigned_card_id", distinct=True)),
    ).filter(paid_order_count__gt=0).order_by("-last_purchase_date", "-pk")


class AdminPurchaserListView(APIView):
    permission_classes = [IsAdminRole]

    def get(self, request):
        qs = purchaser_queryset()
        search = request.query_params.get("search", "").strip()
        if search:
            qs = qs.filter(Q(full_name__icontains=search) | Q(email__icontains=search) | Q(phone__icontains=search) | Q(latest_purchaser_name__icontains=search) | Q(latest_purchaser_phone__icontains=search))
        paginator = StandardPagination()
        page = paginator.paginate_queryset(qs, request)
        return paginator.get_paginated_response(AdminPurchaserSerializer(page, many=True).data)


class AdminPurchaserDetailView(APIView):
    permission_classes = [IsAdminRole]

    def get(self, request, pk):
        recipient_rows = OrderRecipient.objects.select_related("user__onboarding", "profile", "assigned_card")
        paid_orders = Order.objects.filter(payment_status=Order.PaymentStatus.PAID).select_related("customer__onboarding", "checkout_session").prefetch_related("items", Prefetch("recipients", queryset=recipient_rows))
        purchaser = purchaser_queryset().prefetch_related(Prefetch("orders", queryset=paid_orders, to_attr="paid_orders")).filter(pk=pk).first()
        if purchaser is None:
            return error("Purchaser not found.", status=404)
        return success(AdminPurchaserDetailSerializer(purchaser).data)
