from django.http import HttpResponse
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.views import APIView

from common.response import success
from common.throttling import OtpRequestThrottle
from common.views import PaginatedAPIView

from . import services
from .serializers import LeadSerializer, SubmitLeadSerializer


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
        return [IsAuthenticated()]

    def get_throttles(self):
        if self.request.method == "POST":
            return [LeadSubmitThrottle()]
        return []

    def get(self, request):
        search = request.query_params.get("search", "")
        leads = services.list_leads(request.user, search=search)
        return self.paginate(leads, LeadSerializer)

    def post(self, request):
        serializer = SubmitLeadSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        lead = services.submit_lead(serializer.validated_data)
        return success(LeadSerializer(lead).data, message="Thanks! Your details have been sent.", status=201)


class CustomerLeadsExportView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        csv_content = services.leads_csv(request.user)
        response = HttpResponse(csv_content, content_type="text/csv")
        response["Content-Disposition"] = 'attachment; filename="leads.csv"'
        return response
