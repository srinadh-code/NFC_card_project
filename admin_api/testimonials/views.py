from django.db import IntegrityError, transaction
from django.db.models import Count, Q
from rest_framework.views import APIView

from admin_api.permissions import IsAdminRole
from common.pagination import StandardPagination
from common.response import error, success
from testimonials.models import Testimonial

from .serializers import AdminTestimonialSerializer

Status = Testimonial.Status


def _get(pk, lock=False):
    qs = Testimonial.objects.select_related("customer", "order").filter(pk=pk)
    if lock:
        qs = qs.select_for_update(of=("self",))
    return qs.first()


class AdminTestimonialListView(APIView):
    """GET /api/admin/testimonials/ — every testimonial, any status.
    Query params: `search` (customer name/email, display name, company),
    `status` (PENDING/APPROVED/REJECTED), `is_active` (true/false),
    `page`/`page_size`. Newest first."""

    permission_classes = [IsAdminRole]

    def get(self, request):
        qs = Testimonial.objects.select_related("customer", "order")

        search = request.query_params.get("search", "").strip()
        if search:
            qs = qs.filter(
                Q(customer__full_name__icontains=search)
                | Q(customer__email__icontains=search)
                | Q(name__icontains=search)
                | Q(company__icontains=search)
            )

        status_param = request.query_params.get("status", "").strip().upper()
        if status_param:
            if status_param not in Status.values:
                return error("Invalid status filter.", status=400)
            qs = qs.filter(status=status_param)

        active_param = request.query_params.get("is_active", "").strip().lower()
        if active_param in {"true", "false"}:
            qs = qs.filter(is_active=active_param == "true")

        qs = qs.order_by("-created_at")
        paginator = StandardPagination()
        page = paginator.paginate_queryset(qs, request)
        return paginator.get_paginated_response(AdminTestimonialSerializer(page, many=True).data)


class AdminTestimonialStatsView(APIView):
    """GET /api/admin/testimonials/stats/ — counts for the dashboard cards,
    in a single aggregate query."""

    permission_classes = [IsAdminRole]

    def get(self, request):
        stats = Testimonial.objects.aggregate(
            total=Count("id"),
            pending=Count("id", filter=Q(status=Status.PENDING)),
            approved=Count("id", filter=Q(status=Status.APPROVED)),
            rejected=Count("id", filter=Q(status=Status.REJECTED)),
            live=Count("id", filter=Q(status=Status.APPROVED, is_active=True)),
        )
        return success(stats)


class AdminTestimonialDetailView(APIView):
    """GET a single testimonial; DELETE it (e.g. abusive content). The
    customer's words are never edited on their behalf — moderation is
    approve/reject/hide only."""

    permission_classes = [IsAdminRole]

    def get(self, request, pk):
        testimonial = _get(pk)
        if testimonial is None:
            return error("Testimonial not found.", status=404)
        return success(AdminTestimonialSerializer(testimonial).data)

    def delete(self, request, pk):
        testimonial = _get(pk)
        if testimonial is None:
            return error("Testimonial not found.", status=404)
        # Cloudinary cleanup happens in testimonials.signals.
        testimonial.delete()
        return success(None, message="Testimonial deleted.")


class _AdminSetStatusView(APIView):
    permission_classes = [IsAdminRole]
    target_status = None
    success_message = ""

    def patch(self, request, pk):
        try:
            with transaction.atomic():
                testimonial = _get(pk, lock=True)
                if testimonial is None:
                    return error("Testimonial not found.", status=404)
                testimonial.status = self.target_status
                testimonial.save(update_fields=["status", "updated_at"])
        except IntegrityError:
            # Only reachable when moving back to PENDING while the customer
            # already has another pending one (see the model's constraint).
            return error(
                "This customer already has another testimonial pending approval.",
                errors={"code": "pending_exists"},
                status=409,
            )
        return success(AdminTestimonialSerializer(testimonial).data, message=self.success_message)


class AdminTestimonialApproveView(_AdminSetStatusView):
    """PATCH /api/admin/testimonials/<id>/approve/"""

    target_status = Status.APPROVED
    success_message = "Testimonial approved."


class AdminTestimonialRejectView(_AdminSetStatusView):
    """PATCH /api/admin/testimonials/<id>/reject/"""

    target_status = Status.REJECTED
    success_message = "Testimonial rejected."


class AdminTestimonialMarkPendingView(_AdminSetStatusView):
    """PATCH /api/admin/testimonials/<id>/pending/ — moves a testimonial
    back to PENDING, which re-opens it for the customer to edit/delete."""

    target_status = Status.PENDING
    success_message = "Testimonial moved back to pending."


class AdminTestimonialToggleActiveView(APIView):
    """PATCH /api/admin/testimonials/<id>/toggle-active/ — flips
    is_active. Independent of status: an approved testimonial that's
    inactive stays approved but is hidden from the public site."""

    permission_classes = [IsAdminRole]

    def patch(self, request, pk):
        with transaction.atomic():
            testimonial = _get(pk, lock=True)
            if testimonial is None:
                return error("Testimonial not found.", status=404)
            testimonial.is_active = not testimonial.is_active
            testimonial.save(update_fields=["is_active", "updated_at"])
        message = "Testimonial activated." if testimonial.is_active else "Testimonial deactivated."
        return success(AdminTestimonialSerializer(testimonial).data, message=message)
