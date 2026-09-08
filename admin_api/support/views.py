from django.db.models import Q
from rest_framework.views import APIView

from accounts.models import User
from admin_api.permissions import IsAdminRole
from common.pagination import StandardPagination
from common.response import error, success
from support.models import SupportTicket, TicketMessage

from .serializers import (
    AdminSupportTicketCreateSerializer,
    AdminSupportTicketSerializer,
    AdminTicketMessageSerializer,
    AdminTicketPrioritySerializer,
    AdminTicketStatusSerializer,
)


class AdminSupportTicketListCreateView(APIView):
    permission_classes = [IsAdminRole]

    def get(self, request):
        qs = SupportTicket.objects.select_related("customer").prefetch_related("messages").all()

        search = request.query_params.get("search", "").strip()
        if search:
            search_filter = (
                Q(subject__icontains=search)
                | Q(customer__full_name__icontains=search)
                | Q(customer__email__icontains=search)
            )
            if search.isdigit():
                search_filter |= Q(id=int(search))
            qs = qs.filter(search_filter)

        status_param = request.query_params.get("status", "").strip().upper()
        if status_param and status_param in SupportTicket.Status.values:
            qs = qs.filter(status=status_param)

        priority_param = request.query_params.get("priority", "").strip().upper()
        if priority_param and priority_param in SupportTicket.Priority.values:
            qs = qs.filter(priority=priority_param)

        paginator = StandardPagination()
        page = paginator.paginate_queryset(qs, request)
        return paginator.get_paginated_response(AdminSupportTicketSerializer(page, many=True).data)

    def post(self, request):
        serializer = AdminSupportTicketCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data

        customer = User.objects.get(email=data["customer_email"], role=User.Role.CUSTOMER)
        ticket = SupportTicket.objects.create(
            customer=customer,
            subject=data["subject"],
            description=data["description"],
            priority=data.get("priority", SupportTicket.Priority.MEDIUM),
        )
        TicketMessage.objects.create(
            ticket=ticket, sender=TicketMessage.Sender.CUSTOMER, text=data["description"]
        )
        ticket.refresh_from_db()
        return success(AdminSupportTicketSerializer(ticket).data, message="Ticket logged.", status=201)


class AdminSupportTicketDetailView(APIView):
    permission_classes = [IsAdminRole]

    def get(self, request, pk):
        ticket = (
            SupportTicket.objects.select_related("customer").prefetch_related("messages").filter(pk=pk).first()
        )
        if ticket is None:
            return error("Ticket not found.", status=404)
        return success(AdminSupportTicketSerializer(ticket).data)


class AdminTicketStatusView(APIView):
    permission_classes = [IsAdminRole]

    def post(self, request, pk):
        ticket = SupportTicket.objects.filter(pk=pk).first()
        if ticket is None:
            return error("Ticket not found.", status=404)

        serializer = AdminTicketStatusSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        ticket.status = serializer.validated_data["status"]
        ticket.save(update_fields=["status", "updated_at"])
        return success(AdminSupportTicketSerializer(ticket).data, message="Ticket status updated.")


class AdminTicketPriorityView(APIView):
    permission_classes = [IsAdminRole]

    def post(self, request, pk):
        ticket = SupportTicket.objects.filter(pk=pk).first()
        if ticket is None:
            return error("Ticket not found.", status=404)

        serializer = AdminTicketPrioritySerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        ticket.priority = serializer.validated_data["priority"]
        ticket.save(update_fields=["priority", "updated_at"])
        return success(AdminSupportTicketSerializer(ticket).data, message="Ticket priority updated.")


class AdminTicketMessageView(APIView):
    permission_classes = [IsAdminRole]

    def post(self, request, pk):
        ticket = SupportTicket.objects.filter(pk=pk).first()
        if ticket is None:
            return error("Ticket not found.", status=404)

        serializer = AdminTicketMessageSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        TicketMessage.objects.create(
            ticket=ticket, sender=TicketMessage.Sender.SUPPORT, text=serializer.validated_data["text"]
        )
        ticket.save(update_fields=["updated_at"])
        ticket.refresh_from_db()
        return success(AdminSupportTicketSerializer(ticket).data, message="Reply sent.")
