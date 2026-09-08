from django.db.models import Q
from rest_framework.views import APIView

from accounts.models import User
from admin_api.permissions import IsAdminRole
from common.pagination import StandardPagination
from common.response import error, success
from profiles.models import Profile

from .serializers import AdminCustomerDetailSerializer, AdminCustomerListSerializer


class AdminCustomerListView(APIView):
    permission_classes = [IsAdminRole]

    def get(self, request):
        qs = Profile.objects.select_related("user").filter(user__role=User.Role.CUSTOMER)

        search = request.query_params.get("search", "").strip()
        if search:
            qs = qs.filter(
                Q(user__full_name__icontains=search)
                | Q(user__email__icontains=search)
                | Q(username__icontains=search)
            )

        status_param = request.query_params.get("status", "").strip().lower()
        if status_param == "active":
            qs = qs.filter(user__is_active=True)
        elif status_param == "inactive":
            qs = qs.filter(user__is_active=False)

        qs = qs.order_by("-user__created_at")

        paginator = StandardPagination()
        page = paginator.paginate_queryset(qs, request)
        return paginator.get_paginated_response(AdminCustomerListSerializer(page, many=True).data)


class AdminCustomerDetailView(APIView):
    permission_classes = [IsAdminRole]

    def get(self, request, pk):
        profile = (
            Profile.objects.select_related("user")
            .prefetch_related("social_links", "user__nfc_cards", "user__orders")
            .filter(user_id=pk, user__role=User.Role.CUSTOMER)
            .first()
        )
        if profile is None:
            return error("Customer not found.", status=404)

        return success(AdminCustomerDetailSerializer(profile).data)
