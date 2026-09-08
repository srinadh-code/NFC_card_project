from rest_framework import serializers

from accounts.models import User
from support.models import SupportTicket, TicketMessage


class TicketMessageSerializer(serializers.ModelSerializer):
    class Meta:
        model = TicketMessage
        fields = ["id", "sender", "text", "created_at"]
        read_only_fields = fields


class AdminSupportTicketSerializer(serializers.ModelSerializer):
    customer_id = serializers.IntegerField(read_only=True)
    customer_name = serializers.CharField(source="customer.full_name", read_only=True)
    customer_email = serializers.EmailField(source="customer.email", read_only=True)
    messages = TicketMessageSerializer(many=True, read_only=True)

    class Meta:
        model = SupportTicket
        fields = [
            "id",
            "customer_id",
            "customer_name",
            "customer_email",
            "subject",
            "description",
            "priority",
            "status",
            "messages",
            "created_at",
            "updated_at",
        ]
        read_only_fields = fields


class AdminSupportTicketCreateSerializer(serializers.Serializer):
    """Admin logging a ticket on the customer's behalf (e.g. a phone-in
    issue) — auto-seeds the customer's opening message from `description`,
    mirroring how a customer-submitted ticket would start."""

    customer_email = serializers.EmailField()
    subject = serializers.CharField(max_length=200)
    description = serializers.CharField()
    priority = serializers.ChoiceField(choices=SupportTicket.Priority.choices, required=False)

    def validate_customer_email(self, value):
        value = value.strip().lower()
        customer = User.objects.filter(email=value, role=User.Role.CUSTOMER).first()
        if customer is None:
            raise serializers.ValidationError("No customer account found with that email.")
        return value


class AdminTicketStatusSerializer(serializers.Serializer):
    status = serializers.ChoiceField(choices=SupportTicket.Status.choices)


class AdminTicketPrioritySerializer(serializers.Serializer):
    priority = serializers.ChoiceField(choices=SupportTicket.Priority.choices)


class AdminTicketMessageSerializer(serializers.Serializer):
    text = serializers.CharField()
