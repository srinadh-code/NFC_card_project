# Admin-facing customer directory serializers. Operate on profiles.Profile
# (joined to its accounts.User) — no separate Customer model. Order/
# transaction summaries reuse orders.models directly; NFC card summaries
# reuse nfc_cards.serializers.NfcCardMiniSerializer — every number here is a
# real aggregate, never a placeholder.
from rest_framework import serializers

from nfc_cards.serializers import NfcCardMiniSerializer
from orders.models import Order
from profiles.models import Profile


class OrderMiniSerializer(serializers.ModelSerializer):
    total = serializers.DecimalField(max_digits=10, decimal_places=2, read_only=True)

    class Meta:
        model = Order
        fields = ["id", "status", "payment_status", "total", "placed_at"]
        read_only_fields = fields


class AdminCustomerListSerializer(serializers.ModelSerializer):
    """One row per CUSTOMER-role User (queried via their Profile), for the
    admin customer directory. `status` here is the account's active/inactive
    state (`User.is_active`) — distinct from the profile's own ACTIVE/
    SUSPENDED visibility status, which the detail view exposes separately."""

    id = serializers.IntegerField(source="user_id", read_only=True)
    name = serializers.CharField(source="user.full_name", read_only=True)
    email = serializers.EmailField(source="user.email", read_only=True)
    phone = serializers.CharField(source="user.phone", read_only=True)
    avatar = serializers.SerializerMethodField()
    status = serializers.SerializerMethodField()
    joined_on = serializers.DateTimeField(source="user.created_at", read_only=True)
    card_count = serializers.SerializerMethodField()
    order_count = serializers.SerializerMethodField()
    recipient_allocation_count = serializers.SerializerMethodField()
    activated_card_count = serializers.SerializerMethodField()
    profile_status = serializers.CharField(source="status", read_only=True)
    activation_status = serializers.SerializerMethodField()

    class Meta:
        model = Profile
        fields = [
            "id",
            "name",
            "email",
            "phone",
            "company",
            "designation",
            "username",
            "status",
            "avatar",
            "joined_on",
            "card_count",
            "order_count",
            "recipient_allocation_count",
            "activated_card_count",
            "profile_status",
            "activation_status",
        ]
        read_only_fields = fields

    def get_avatar(self, obj):
        if obj.avatar:
            return obj.avatar.url
        return obj.user.avatar_url

    def get_status(self, obj):
        return "Active" if obj.user.is_active else "Inactive"

    def get_card_count(self, obj):
        return obj.user.nfc_cards.count()

    def get_order_count(self, obj):
        return obj.user.orders.count()

    def get_recipient_allocation_count(self, obj):
        return len(obj.user.order_recipients.all())

    def get_activated_card_count(self, obj):
        return sum(card.status == "ACTIVE" for card in obj.user.nfc_cards.all())

    def get_activation_status(self, obj):
        return "PENDING" if obj.user.must_change_password else "ACTIVATED"


class AdminCustomerDetailSerializer(AdminCustomerListSerializer):
    """Adds full profile detail, social links, the customer's real NFC
    cards, and order/transaction summaries on top of the list row shape."""

    website = serializers.URLField(read_only=True)
    address = serializers.CharField(read_only=True)
    bio = serializers.CharField(read_only=True)
    profile_status = serializers.CharField(source="status", read_only=True)
    social_links = serializers.SerializerMethodField()
    cards = serializers.SerializerMethodField()
    total_spent = serializers.SerializerMethodField()
    recent_orders = serializers.SerializerMethodField()
    transaction_summary = serializers.SerializerMethodField()
    recipient_allocations = serializers.SerializerMethodField()

    class Meta(AdminCustomerListSerializer.Meta):
        fields = AdminCustomerListSerializer.Meta.fields + [
            "website",
            "address",
            "bio",
            "social_links",
            "cards",
            "total_spent",
            "recent_orders",
            "transaction_summary",
            "recipient_allocations",
        ]
        read_only_fields = fields

    def get_recipient_allocations(self, obj):
        from admin_api.orders.serializers import OrderRecipientSerializer

        return OrderRecipientSerializer(obj.user.order_recipients.all(), many=True).data

    def get_social_links(self, obj):
        from profiles.serializers import SocialLinkSerializer

        return SocialLinkSerializer(obj.social_links.all(), many=True).data

    def get_cards(self, obj):
        return NfcCardMiniSerializer(obj.user.nfc_cards.all(), many=True).data

    def get_total_spent(self, obj):
        orders = obj.user.orders.exclude(status=Order.Status.CANCELLED)
        return sum((o.total for o in orders), start=0)

    def get_recent_orders(self, obj):
        orders = obj.user.orders.all()[:5]
        return OrderMiniSerializer(orders, many=True).data

    def get_transaction_summary(self, obj):
        from orders.models import Transaction

        transactions = Transaction.objects.filter(order__customer=obj.user)
        paid = transactions.filter(status=Order.PaymentStatus.PAID)
        refunded = transactions.filter(status=Order.PaymentStatus.REFUNDED)
        return {
            "count": transactions.count(),
            "total_paid": sum((t.amount for t in paid), start=0),
            "total_refunded": sum((t.amount for t in refunded), start=0),
        }
