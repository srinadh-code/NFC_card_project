from django.db import IntegrityError, transaction
from rest_framework import status
from rest_framework.parsers import FormParser, JSONParser, MultiPartParser
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.throttling import ScopedRateThrottle
from rest_framework.views import APIView

from common.image_storage import delete_image
from common.response import error, success

from .models import Testimonial
from .permissions import HasPurchasedCard
from .serializers import CustomerTestimonialSerializer, PublicTestimonialSerializer
from .services import NOT_ELIGIBLE_MESSAGE, paid_orders, upload_testimonial_image

PUBLIC_MAX_LIMIT = 100

PENDING_EXISTS_MESSAGE = (
    "You already have a testimonial awaiting approval. You can edit it until an admin reviews it."
)
NOT_EDITABLE_MESSAGE = "Only pending testimonials can be edited or deleted."


def _truthy(value):
    return str(value).strip().lower() in {"1", "true", "yes", "on"}


def _upload_from_request(request):
    """Uploads `profile_image` from a multipart request, if present.
    Returns the model fields to save ({} when no file was sent)."""
    file_obj = request.FILES.get("profile_image")
    if not file_obj:
        return {}
    uploaded = upload_testimonial_image(file_obj)
    return {"profile_image": uploaded["url"], "profile_image_public_id": uploaded["public_id"]}


def _own_testimonial(request, pk, lock=False):
    """Always scoped to request.user — another customer's testimonial id
    is indistinguishable from a non-existent one (404, never 403), so ids
    can't be probed."""
    qs = Testimonial.objects.select_related("order").filter(pk=pk, customer=request.user)
    if lock:
        qs = qs.select_for_update(of=("self",))
    return qs.first()


class _NotEditable(Exception):
    pass


# ---------------------------------------------------------------------------
# Public
# ---------------------------------------------------------------------------


class PublicTestimonialListAPIView(APIView):
    """GET /api/testimonials/ — APPROVED + active only, newest first.
    Filtering happens here, server-side; the frontend never receives a
    pending/rejected/hidden row. Optional ?limit=N (max 100)."""

    permission_classes = [AllowAny]
    authentication_classes = []

    def get(self, request):
        qs = Testimonial.objects.filter(
            status=Testimonial.Status.APPROVED, is_active=True
        ).order_by("-created_at")

        limit = request.query_params.get("limit")
        if limit:
            try:
                limit = max(1, min(int(limit), PUBLIC_MAX_LIMIT))
            except ValueError:
                return error("`limit` must be a number.", status=400)
            qs = qs[:limit]

        return success(PublicTestimonialSerializer(qs, many=True).data)


# ---------------------------------------------------------------------------
# Customer
# ---------------------------------------------------------------------------


class TestimonialEligibilityAPIView(APIView):
    """GET /api/testimonials/eligibility/ — lets the customer dashboard
    decide up front whether to show the submit form, and which paid orders
    a testimonial can be linked to."""

    permission_classes = [IsAuthenticated]

    def get(self, request):
        orders = paid_orders(request.user).order_by("-placed_at").values("id", "order_number", "placed_at")
        eligible = bool(orders)
        has_pending = Testimonial.objects.filter(
            customer=request.user, status=Testimonial.Status.PENDING
        ).exists()
        return success(
            {
                "eligible": eligible,
                "has_pending": has_pending,
                "can_submit": eligible and not has_pending,
                "message": None if eligible else NOT_ELIGIBLE_MESSAGE,
                "orders": list(orders),
            }
        )


class MyTestimonialListAPIView(APIView):
    """GET /api/testimonials/my/ — every testimonial the logged-in customer
    has submitted, in any status."""

    permission_classes = [IsAuthenticated]

    def get(self, request):
        qs = Testimonial.objects.select_related("order").filter(customer=request.user).order_by("-created_at")
        return success(CustomerTestimonialSerializer(qs, many=True, context={"request": request}).data)


class TestimonialCreateAPIView(APIView):
    """POST /api/testimonials/create/ — multipart (with optional
    `profile_image` file) or JSON. Requires a PAID order; new testimonials
    always start PENDING."""

    permission_classes = [IsAuthenticated, HasPurchasedCard]
    parser_classes = [MultiPartParser, FormParser, JSONParser]
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = "testimonial_submit"

    def post(self, request):
        if Testimonial.objects.filter(customer=request.user, status=Testimonial.Status.PENDING).exists():
            return error(PENDING_EXISTS_MESSAGE, errors={"code": "pending_exists"}, status=status.HTTP_409_CONFLICT)

        serializer = CustomerTestimonialSerializer(data=request.data, context={"request": request})
        serializer.is_valid(raise_exception=True)

        # Link to the order the customer picked, else their most recent
        # paid order — always one of their own (see serializer.get_fields).
        order = serializer.validated_data.pop("order", None) or (
            paid_orders(request.user).order_by("-placed_at").first()
        )

        # Upload only after validation passes, so bad input never costs a
        # Cloudinary upload; and clean it up if the DB write then fails.
        image_fields = _upload_from_request(request)
        try:
            with transaction.atomic():
                testimonial = serializer.save(
                    customer=request.user,
                    order=order,
                    status=Testimonial.Status.PENDING,
                    **image_fields,
                )
        except IntegrityError:
            # Lost a race with a concurrent submission — the partial
            # unique constraint in models.py caught the second PENDING row.
            delete_image(image_fields.get("profile_image_public_id"))
            return error(PENDING_EXISTS_MESSAGE, errors={"code": "pending_exists"}, status=status.HTTP_409_CONFLICT)
        except Exception:
            delete_image(image_fields.get("profile_image_public_id"))
            raise

        return success(
            CustomerTestimonialSerializer(testimonial, context={"request": request}).data,
            message="Thank you! Your testimonial has been submitted for approval.",
            status=status.HTTP_201_CREATED,
        )


class TestimonialUpdateAPIView(APIView):
    """PUT/PATCH /api/testimonials/<id>/update/ — own testimonial, PENDING
    only. Accepts an optional new `profile_image` file (replaces the old
    one) or `remove_profile_image=true`. PUT requires the full set of
    required fields; PATCH is partial."""

    permission_classes = [IsAuthenticated]
    parser_classes = [MultiPartParser, FormParser, JSONParser]

    def put(self, request, pk):
        return self._update(request, pk, partial=False)

    def patch(self, request, pk):
        return self._update(request, pk, partial=True)

    def _update(self, request, pk, partial):
        testimonial = _own_testimonial(request, pk)
        if testimonial is None:
            return error("Testimonial not found.", status=status.HTTP_404_NOT_FOUND)
        # Cheap pre-check so a non-editable testimonial never triggers an
        # upload; re-checked under a row lock below, since an admin may
        # approve it between now and the write.
        if not testimonial.is_editable_by_customer:
            return error(NOT_EDITABLE_MESSAGE, errors={"code": "not_editable"}, status=status.HTTP_403_FORBIDDEN)

        serializer = CustomerTestimonialSerializer(
            testimonial, data=request.data, partial=partial, context={"request": request}
        )
        serializer.is_valid(raise_exception=True)

        image_fields = _upload_from_request(request)
        if not image_fields and _truthy(request.data.get("remove_profile_image")):
            image_fields = {"profile_image": "", "profile_image_public_id": ""}

        try:
            with transaction.atomic():
                locked = _own_testimonial(request, pk, lock=True)
                if locked is None or not locked.is_editable_by_customer:
                    raise _NotEditable
                old_public_id = locked.profile_image_public_id
                serializer.instance = locked
                testimonial = serializer.save(**image_fields)
        except _NotEditable:
            delete_image(image_fields.get("profile_image_public_id"))
            return error(NOT_EDITABLE_MESSAGE, errors={"code": "not_editable"}, status=status.HTTP_403_FORBIDDEN)
        except Exception:
            delete_image(image_fields.get("profile_image_public_id"))
            raise

        # Replaced or removed — the previous Cloudinary asset is now orphaned.
        if image_fields and old_public_id and old_public_id != testimonial.profile_image_public_id:
            transaction.on_commit(lambda: delete_image(old_public_id))

        return success(
            CustomerTestimonialSerializer(testimonial, context={"request": request}).data,
            message="Testimonial updated.",
        )


class TestimonialDeleteAPIView(APIView):
    """DELETE /api/testimonials/<id>/delete/ — own testimonial, PENDING
    only. The Cloudinary image is removed by signals.delete_testimonial_image."""

    permission_classes = [IsAuthenticated]

    def delete(self, request, pk):
        with transaction.atomic():
            testimonial = _own_testimonial(request, pk, lock=True)
            if testimonial is None:
                return error("Testimonial not found.", status=status.HTTP_404_NOT_FOUND)
            if not testimonial.is_editable_by_customer:
                return error(NOT_EDITABLE_MESSAGE, errors={"code": "not_editable"}, status=status.HTTP_403_FORBIDDEN)
            testimonial.delete()
        return success(None, message="Testimonial deleted.")

