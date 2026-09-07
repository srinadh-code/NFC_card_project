from rest_framework import viewsets
from rest_framework.decorators import action
from rest_framework.parsers import FormParser, MultiPartParser
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.views import APIView

from analytics.models import TapEvent
from analytics.tracking import log_event
from common.response import error, success

from .models import CustomField, CustomLink, Profile, SocialLink
from .serializers import (
    CustomFieldSerializer,
    CustomLinkSerializer,
    ProfileSerializer,
    PublicProfileSerializer,
    SocialLinkSerializer,
)


class MyProfileView(APIView):
    permission_classes = [IsAuthenticated]

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
    permission_classes = [IsAuthenticated]
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
    permission_classes = [IsAuthenticated]

    @action(detail=False, methods=["patch"])
    def reorder(self, request):
        return self._reorder(request)


class CustomLinkViewSet(OwnedByProfileMixin, viewsets.ModelViewSet):
    model = CustomLink
    serializer_class = CustomLinkSerializer
    permission_classes = [IsAuthenticated]

    @action(detail=False, methods=["patch"])
    def reorder(self, request):
        return self._reorder(request)


class CustomFieldViewSet(OwnedByProfileMixin, viewsets.ModelViewSet):
    model = CustomField
    serializer_class = CustomFieldSerializer
    permission_classes = [IsAuthenticated]

    @action(detail=False, methods=["patch"])
    def reorder(self, request):
        return self._reorder(request)


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
            record_event(profile.user, AnalyticsEvent.EventType.QR_SCAN, request=request, source="qr")

        return success(PublicProfileSerializer(profile, context={"request": request}).data)
