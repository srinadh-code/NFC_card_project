from django.db.models import Q
from rest_framework.views import APIView

from accounts.models import User
from accounts.roles import is_purchaser, is_recipient, recipient_condition
from admin_api.permissions import IsAdminRole
from common.pagination import StandardPagination
from common.response import error, success
from profiles.models import Profile

from .serializers import AdminProfileSerializer, AdminProfileUpdateSerializer


class AdminProfileListCreateView(APIView):
    permission_classes = [IsAdminRole]

    def get(self, request):
        # Digital profiles of card recipients only (accounts/roles.py): a
        # purchaser-only account never appears here, even if an older build
        # auto-created a profile row for it (kept, not deleted).
        qs = Profile.objects.select_related("user").filter(recipient_condition("user_id"))

        search = request.query_params.get("search", "").strip()
        if search:
            search_filter = Q(user__full_name__icontains=search) | Q(username__icontains=search)
            if search.isdigit():
                search_filter |= Q(id=int(search))
            qs = qs.filter(search_filter)

        qs = qs.order_by("-created_at")

        paginator = StandardPagination()
        page = paginator.paginate_queryset(qs, request)
        return paginator.get_paginated_response(AdminProfileSerializer(page, many=True).data)

    def post(self, request):
        """Idempotent: every CUSTOMER already gets a profile at registration
        (see accounts.views.RegisterView / VerifyEmailView), so this mainly
        covers a legacy/edge-case account that somehow doesn't have one yet
        — never creates a second profile for a user who already has one."""
        user_id = request.data.get("user_id")
        if not user_id:
            return error("user_id is required.", status=400)

        user = User.objects.filter(pk=user_id, role=User.Role.CUSTOMER).first()
        if user is None:
            return error("No customer account found with that id.", status=404)

        # Purchasing cards for other people is not a card allocation: a
        # purchaser-only account gets no digital profile.
        if is_purchaser(user) and not is_recipient(user):
            return error(
                "This account is a purchaser only. A digital profile is created when a card is allocated to it.",
                errors={"code": "purchaser_only"},
                status=400,
            )

        existing = getattr(user, "profile", None)
        if existing is not None:
            return success(
                AdminProfileSerializer(existing).data,
                message="This customer already has a profile.",
                status=200,
            )

        profile = Profile.ensure_for_user(user)
        return success(AdminProfileSerializer(profile).data, message="Profile created.", status=201)


class AdminProfileDetailView(APIView):
    permission_classes = [IsAdminRole]

    def get_object(self, pk):
        return Profile.objects.select_related("user").filter(recipient_condition("user_id"), pk=pk).first()

    def get(self, request, pk):
        profile = self.get_object(pk)
        if profile is None:
            return error("Profile not found.", status=404)
        return success(AdminProfileSerializer(profile).data)

    def patch(self, request, pk):
        profile = self.get_object(pk)
        if profile is None:
            return error("Profile not found.", status=404)

        serializer = AdminProfileUpdateSerializer(data=request.data, partial=True, context={"profile": profile})
        serializer.is_valid(raise_exception=True)
        serializer.save(profile)
        profile.refresh_from_db()
        return success(AdminProfileSerializer(profile).data, message="Profile updated.")


class AdminProfileActivateView(APIView):
    permission_classes = [IsAdminRole]

    def post(self, request, pk):
        profile = Profile.objects.filter(pk=pk, user__role=User.Role.CUSTOMER).first()
        if profile is None:
            return error("Profile not found.", status=404)
        profile.status = Profile.Status.ACTIVE
        profile.save(update_fields=["status", "updated_at"])
        return success(AdminProfileSerializer(profile).data, message="Profile activated.")


class AdminProfileSuspendView(APIView):
    permission_classes = [IsAdminRole]

    def post(self, request, pk):
        profile = Profile.objects.filter(pk=pk, user__role=User.Role.CUSTOMER).first()
        if profile is None:
            return error("Profile not found.", status=404)
        profile.status = Profile.Status.SUSPENDED
        profile.save(update_fields=["status", "updated_at"])
        return success(AdminProfileSerializer(profile).data, message="Profile suspended.")
