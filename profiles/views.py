from django.db import transaction
from rest_framework import viewsets
from rest_framework.decorators import action
from rest_framework.parsers import FormParser, MultiPartParser
from rest_framework.permissions import AllowAny
from rest_framework.views import APIView

from analytics.models import TapEvent
from analytics.tracking import log_event
from common.permissions import IsCustomerRole
from common.response import error, success

from .models import CustomField, CustomLink, Profile, SocialLink
from .serializers import (
    CustomFieldBulkItemSerializer,
    CustomFieldSerializer,
    CustomLinkSerializer,
    ProfileSerializer,
    PublicProfileSerializer,
    SocialLinkSerializer,
)


class MyProfileView(APIView):
    permission_classes = [IsCustomerRole]

    def get(self, request):
        profile = Profile.ensure_for_user(request.user)
        return success(ProfileSerializer(profile, context={"request": request}).data)

    def patch(self, request):
        profile = Profile.ensure_for_user(request.user)
        serializer = ProfileSerializer(
            profile, data=request.data, partial=True, context={"request": request}
        )
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return success(serializer.data, message="Profile updated.")


class MyAvatarView(APIView):
    permission_classes = [IsCustomerRole]
    parser_classes = [MultiPartParser, FormParser]

    def post(self, request):
        profile = Profile.ensure_for_user(request.user)
        file = request.FILES.get("avatar")
        if not file:
            return error("No avatar file provided.", status=400)
        if not file.content_type.startswith("image/"):
            return error("Avatar must be an image file.", status=400)
        if file.size > 5 * 1024 * 1024:
            return error("Avatar must be smaller than 5MB.", status=400)

        profile.avatar = file
        profile.save(update_fields=["avatar"])
        return success(ProfileSerializer(profile, context={"request": request}).data)


class OwnedByProfileMixin:
    """Scopes queryset to the requesting user's own profile and auto-attaches it on create."""

    def get_queryset(self):
        return self.model.objects.filter(profile__user=self.request.user)

    def perform_create(self, serializer):
        profile = Profile.ensure_for_user(self.request.user)
        serializer.save(profile=profile)

    def _reorder(self, request):
        ids = request.data.get("order", [])
        owned_ids = set(self.get_queryset().values_list("id", flat=True))
        for index, item_id in enumerate(ids):
            if item_id in owned_ids:
                self.model.objects.filter(id=item_id).update(display_order=index)
        return success(message="Order updated.")


class SocialLinkViewSet(OwnedByProfileMixin, viewsets.ModelViewSet):
    model = SocialLink
    serializer_class = SocialLinkSerializer
    permission_classes = [IsCustomerRole]

    @action(detail=False, methods=["patch"])
    def reorder(self, request):
        return self._reorder(request)


class CustomLinkViewSet(OwnedByProfileMixin, viewsets.ModelViewSet):
    model = CustomLink
    serializer_class = CustomLinkSerializer
    permission_classes = [IsCustomerRole]

    @action(detail=False, methods=["patch"])
    def reorder(self, request):
        return self._reorder(request)


class CustomFieldViewSet(OwnedByProfileMixin, viewsets.ModelViewSet):
    model = CustomField
    serializer_class = CustomFieldSerializer
    permission_classes = [IsCustomerRole]

    @action(detail=False, methods=["patch"])
    def reorder(self, request):
        return self._reorder(request)

    @action(detail=False, methods=["put"])
    def bulk(self, request):
        """Replaces the customer's whole custom-field list in one atomic
        step — what My Profile's Save Changes sends. Rows with an `id` the
        customer owns are updated in place (never duplicated), rows without
        one are created, owned rows missing from the list are deleted, and
        list position becomes display_order. An `id` belonging to anyone
        else is treated as a new row, so it can never touch their data.

        Body: {"fields": [{"id"?: int, "label": str, "value": str}, ...]}
        """
        items = request.data.get("fields")
        if not isinstance(items, list):
            return error("Expected a list of fields.", errors={"fields": ["Expected a list of fields."]})
        serializer = CustomFieldBulkItemSerializer(data=items, many=True)
        if not serializer.is_valid():
            # Index-aligned with the request, so the editor can mark the row.
            return error(
                "Please complete or remove the highlighted custom fields.",
                errors={"fields": serializer.errors},
            )
        rows = [row for row in serializer.validated_data if row["label"] or row["value"]]

        profile = Profile.ensure_for_user(request.user)
        with transaction.atomic():
            # Serializes concurrent saves from the same customer (two tabs).
            Profile.objects.select_for_update().filter(pk=profile.pk).first()
            existing = {f.id: f for f in CustomField.objects.filter(profile=profile)}
            kept_ids = set()
            for order, row in enumerate(rows):
                field = existing.get(row.get("id"))
                if field is not None and field.id not in kept_ids:
                    field.label, field.value, field.display_order = row["label"], row["value"], order
                    field.save(update_fields=["label", "value", "display_order"])
                else:
                    field = CustomField.objects.create(
                        profile=profile, label=row["label"], value=row["value"], display_order=order
                    )
                kept_ids.add(field.id)
            CustomField.objects.filter(profile=profile).exclude(id__in=kept_ids).delete()

        saved = CustomField.objects.filter(profile=profile).order_by("display_order", "id")
        return success(CustomFieldSerializer(saved, many=True).data, message="Custom fields saved.")


class PublicProfileView(APIView):
    permission_classes = [AllowAny]

    def get(self, request, username):
        profile = Profile.objects.filter(username__iexact=username).select_related("user").first()

        if profile is None or not profile.profile_public or profile.status != Profile.Status.ACTIVE:
            # 404 (not 403) in both the "missing" and "private/suspended" cases
            # so a probing request can't distinguish "doesn't exist" from
            # "exists but is private".
            return error("This profile is not available.", status=404)

        log_event(request, action=TapEvent.Action.PROFILE_VIEW, customer=profile.user)

        from customer_management.customer_analytics.models import AnalyticsEvent
        from customer_management.customer_analytics.services import record_event

        record_event(profile.user, AnalyticsEvent.EventType.PROFILE_VIEW, request=request)
        if request.query_params.get("src") == "qr":
            record_event(
                profile.user, AnalyticsEvent.EventType.QR_SCAN, request=request, source="qr", dedupe_seconds=10
            )

        # notify() itself checks CustomerSettings.notify_profile_views before
        # creating anything (see customer_notifications/services.py) — this
        # call site only adds the one check notify() can't make on its own:
        # never notify the owner for viewing their own public profile.
        is_owner_viewing_self = request.user.is_authenticated and request.user == profile.user
        if not is_owner_viewing_self:
            from customer_management.customer_notifications.models import Notification
            from customer_management.customer_notifications.services import notify

            notify(
                profile.user,
                "Your profile received a new view",
                "Someone just viewed your public profile.",
                type=Notification.Type.PROFILE_VIEW,
            )

        return success(PublicProfileSerializer(profile, context={"request": request}).data)
