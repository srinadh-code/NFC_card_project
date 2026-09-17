from rest_framework import status
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.views import APIView

from common.response import error, success
from orders.models import Order

from .models import Review
from .serializers import PublicReviewSerializer, ReviewSerializer


def _has_eligible_order(user):
    """A customer may review once they've actually paid for something —
    the same bar this codebase already uses elsewhere for "has this
    customer really bought something" checks (see
    orders/services.py::resolve_customer_plan, which gates a customer's
    template-plan entitlement on this exact same
    payment_status=PaymentStatus.PAID filter). Reused here rather than
    inventing a second, different definition of "eligible order"."""
    return Order.objects.filter(customer=user, payment_status=Order.PaymentStatus.PAID).exists()


class CustomerReviewAPIView(APIView):
    """The logged-in customer's own review — one resource, three verbs.
    Always resolved via request.user; a user_id in the request body is
    never read, so Customer A can never touch Customer B's review through
    this endpoint (see PART 16 in the spec this implements)."""

    permission_classes = [IsAuthenticated]

    def get(self, request):
        review = Review.objects.filter(user=request.user).first()
        if review is None:
            return success({"has_review": False})
        return success({"has_review": True, "review": ReviewSerializer(review).data})

    def post(self, request):
        if not _has_eligible_order(request.user):
            return error(
                "You can submit a review after completing an order.",
                errors={"code": "no_eligible_order"},
                status=status.HTTP_403_FORBIDDEN,
            )

        # Belt-and-braces alongside the OneToOneField's own DB-level
        # uniqueness (models.py) — this gives a clean, specific message
        # instead of surfacing an IntegrityError to the client, but the
        # constraint is what actually prevents a duplicate row from ever
        # existing, independent of this check.
        if Review.objects.filter(user=request.user).exists():
            return error(
                "You already have a review. You can edit your existing review.",
                errors={"code": "review_already_exists"},
                status=status.HTTP_409_CONFLICT,
            )

        serializer = ReviewSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        review = serializer.save(user=request.user)
        return success(ReviewSerializer(review).data, message="Review submitted.", status=status.HTTP_201_CREATED)

    def patch(self, request):
        review = Review.objects.filter(user=request.user).first()
        if review is None:
            return error(
                "You don't have a review yet.",
                errors={"code": "review_not_found"},
                status=status.HTTP_404_NOT_FOUND,
            )

        # rating/review_text only — is_published is read-only on this
        # serializer (see serializers.py), so nothing here can touch it.
        # Editing a disabled review must NOT silently re-publish it (PART 5
        # / "IMPORTANT MODERATION BEHAVIOR" in the spec): since the field
        # is simply never written by this call, whatever it was before
        # (True or False) is exactly what it still is after — no explicit
        # "don't change it" branch needed, because nothing here can change it.
        serializer = ReviewSerializer(review, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        review = serializer.save()
        return success(ReviewSerializer(review).data, message="Review updated.")


class PublicReviewsAPIView(APIView):
    """Anonymous, read-only. Filtering to is_published=True happens here,
    server-side — the frontend never receives a disabled review to hide,
    it simply never sees the row at all."""

    permission_classes = [AllowAny]

    def get(self, request):
        reviews = Review.objects.filter(is_published=True).select_related("user").order_by("-created_at")
        return success(PublicReviewSerializer(reviews, many=True).data)
