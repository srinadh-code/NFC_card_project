from django.db.models import Q
from rest_framework.views import APIView

from admin_api.permissions import IsAdminRole
from common.pagination import StandardPagination
from common.response import error, success
from reviews.models import Review

from .serializers import AdminReviewListSerializer, AdminReviewStatusSerializer


class AdminReviewListView(APIView):
    """Every review, enabled or disabled — admin needs to see both (see
    AdminReviewDetailView for the enable/disable action itself). Search and
    status-filter follow the exact same shape as
    AdminOrderListCreateView/AdminCustomerListView: a `search` query param
    (name/text) and a `status` query param (enabled/disabled), newest
    first, paginated with the project's shared StandardPagination."""

    permission_classes = [IsAdminRole]

    def get(self, request):
        qs = Review.objects.select_related("user").all()

        search = request.query_params.get("search", "").strip()
        if search:
            qs = qs.filter(
                Q(user__full_name__icontains=search)
                | Q(user__email__icontains=search)
                | Q(review_text__icontains=search)
            )

        status_param = request.query_params.get("status", "").strip().lower()
        if status_param == "enabled":
            qs = qs.filter(is_published=True)
        elif status_param == "disabled":
            qs = qs.filter(is_published=False)

        qs = qs.order_by("-created_at")

        paginator = StandardPagination()
        page = paginator.paginate_queryset(qs, request)
        return paginator.get_paginated_response(AdminReviewListSerializer(page, many=True).data)


class AdminReviewDetailView(APIView):
    """GET a single review's full detail; PATCH its moderation status.
    is_published is the only field admin may change here — rating/
    review_text stay the customer's own words, never edited on their
    behalf."""

    permission_classes = [IsAdminRole]

    def get(self, request, pk):
        review = Review.objects.select_related("user").filter(pk=pk).first()
        if review is None:
            return error("Review not found.", status=404)
        return success(AdminReviewListSerializer(review).data)

    def patch(self, request, pk):
        review = Review.objects.select_related("user").filter(pk=pk).first()
        if review is None:
            return error("Review not found.", status=404)

        serializer = AdminReviewStatusSerializer(data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        if "is_published" in serializer.validated_data:
            review.is_published = serializer.validated_data["is_published"]
            review.save(update_fields=["is_published"])

        message = "Review enabled." if review.is_published else "Review disabled."
        return success(AdminReviewListSerializer(review).data, message=message)
