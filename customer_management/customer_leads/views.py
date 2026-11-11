from django.http import HttpResponse
from rest_framework.permissions import AllowAny
from rest_framework.views import APIView
from common.permissions import IsRecipientCustomer
from common.response import success
from common.throttling import OtpRequestThrottle
from common.views import PaginatedAPIView
from . import services
from .serializers import LeadSerializer, SubmitLeadSerializer, UpdateLeadStatusSerializer


class LeadSubmitThrottle(OtpRequestThrottle):
    """Reuses the per-identifier throttle shape, scoped to lead submissions."""

    scope = "lead_submit"

    def get_cache_key(self, request, view):
        username = (request.data.get("username") or "").strip().lower()
        if not username:
            return None
        return self.cache_format % {"scope": self.scope, "ident": username}


class CustomerLeadsView(PaginatedAPIView):
    """GET (owner, list/search) and POST (public, visitor submits) share this path."""

    def get_permissions(self):
        if self.request.method == "POST":
            return [AllowAny()]
        return [IsRecipientCustomer()]

    def get_throttles(self):
        if self.request.method == "POST":
            return [LeadSubmitThrottle()]
        return []

    def get(self, request):
        search = request.query_params.get("search", "")
        status_filter = request.query_params.get("status", "")
        leads = services.list_leads(request.user, search=search, status=status_filter)
        return self.paginate(leads, LeadSerializer)

    def post(self, request):
        serializer = SubmitLeadSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        lead, created = services.submit_lead(serializer.validated_data)
        return success(
            LeadSerializer(lead).data,
            message="Thanks! Your enquiry has been sent.",
            status=201 if created else 200,
        )


class CustomerLeadDetailView(APIView):
    """PATCH /api/customer/leads/<id>/ - the owner updates a lead's status."""

    permission_classes = [IsRecipientCustomer]

    def patch(self, request, lead_id):
        serializer = UpdateLeadStatusSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        lead = services.update_lead_status(request.user, lead_id, serializer.validated_data["status"])
        return success(LeadSerializer(lead).data, message="Lead status updated.")


class CustomerLeadsExportView(APIView):
    permission_classes = [IsRecipientCustomer]

    def get(self, request):
        csv_content = services.leads_csv(request.user)
        response = HttpResponse(csv_content, content_type="text/csv")
        response["Content-Disposition"] = 'attachment; filename="leads.csv"'
        return response
