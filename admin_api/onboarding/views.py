from django.db.models import Q
from rest_framework.views import APIView

from accounts import onboarding
from accounts.models import CustomerOnboarding
from admin_api.permissions import IsAdminRole
from common.pagination import StandardPagination
from common.response import error, success


def _row(item):
    user = item.user
    order = item.source_order
    session = getattr(order, "checkout_session", None) if order is not None else None
    return {
        "id": item.pk,
        "customer_id": user.pk,
        "customer_name": user.full_name,
        "customer_email": user.email,
        "customer_phone": user.phone,
        "email_verified_by_otp": bool(session and session.email_verified),
        "phone_verified_by_otp": bool(session and session.phone_verified),
        "order_status": order.status if order is not None else None,
        "order_id": item.source_order_id,
        "order_number": item.source_order.order_number if item.source_order else None,
        "account_created_at": user.created_at,
        "account_status": item.account_status,
        "account_status_display": CustomerOnboarding.AccountStatus(item.account_status).label,
        "password_set_at": item.password_set_at,
        "email_status": item.email_status,
        "email_attempts": item.email_attempts,
        "email_last_error": item.email_last_error,
        "email_sent_at": item.email_sent_at,
        "credentials_issued_at": item.credentials_issued_at,
    }


class AdminOnboardingListView(APIView):
    """Accounts created automatically from paid orders, with activation and
    activation-email delivery status. Never includes any password or link."""

    permission_classes = [IsAdminRole]

    def get(self, request):
        qs = CustomerOnboarding.objects.select_related("user", "source_order", "source_order__checkout_session").all()
        search = request.query_params.get("search", "").strip()
        if search:
            qs = qs.filter(
                Q(user__email__icontains=search)
                | Q(user__full_name__icontains=search)
                | Q(source_order__order_number__icontains=search)
            )
        email_status = request.query_params.get("email_status", "").strip().upper()
        if email_status in CustomerOnboarding.EmailStatus.values:
            qs = qs.filter(email_status=email_status)
        activation = request.query_params.get("activation", "").strip().upper()
        if activation == "ACTIVATED":
            qs = qs.filter(user__must_change_password=False)
        elif activation == "PENDING_PROCESSING":
            qs = qs.filter(user__must_change_password=True, credentials_issued_at__isnull=True)
        elif activation == "EMAIL_SENT":
            qs = qs.filter(user__must_change_password=True, credentials_issued_at__isnull=False)
        paginator = StandardPagination()
        page = paginator.paginate_queryset(qs, request)
        return paginator.get_paginated_response([_row(item) for item in page])


class AdminOnboardingResendView(APIView):
    """Resend activation email: issues a NEW set-password link (the previous
    one stops working) and emails it. Only for accounts that haven't set
    their own password, and only after the order reached Processing."""

    permission_classes = [IsAdminRole]

    def post(self, request, pk):
        item = CustomerOnboarding.objects.select_related("user").filter(pk=pk).first()
        if item is None:
            return error("Not found.", status=404)
        if not item.user.must_change_password:
            return error("This customer has already activated their account.", status=400)
        if item.credentials_issued_at is None:
            return error(
                "Move the customer's order to Processing first — that sends the activation email.",
                errors={"code": "not_processing"},
                status=400,
            )
        onboarding.reissue_and_send(item.user)
        item.refresh_from_db()
        return success(_row(item), message="A new activation link is being emailed to the customer.")
