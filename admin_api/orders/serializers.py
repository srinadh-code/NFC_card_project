from decimal import Decimal

from rest_framework import serializers

from accounts.models import User
from orders.models import Order, OrderItem
from orders.serializers import ORDER_ITEM_CARD_TYPE_CHOICES

from .services import STEP_FIELDS

TRACKING_LABELS = ["Order Placed", "Order Confirmed", "Shipped", "Out for Delivery", "Delivered"]


class OrderItemSerializer(serializers.ModelSerializer):
    class Meta:
        model = OrderItem
        fields = [
            "product_id",
            "name",
            "card_type",
            "color",
            "qty",
            "pricing_tier",
            "price",
            "original_price",
            "discount_type",
            "discount_value",
            "discount_amount",
            "promo_code_used",
        ]
        read_only_fields = fields


class AdminOrderSerializer(serializers.ModelSerializer):
    customer_id = serializers.IntegerField(read_only=True)
    customer_name = serializers.CharField(source="customer.full_name", read_only=True)
    customer_email = serializers.EmailField(source="customer.email", read_only=True)
    customer_phone = serializers.CharField(source="customer.phone", read_only=True)
    items = OrderItemSerializer(many=True, read_only=True)
    total = serializers.DecimalField(max_digits=10, decimal_places=2, read_only=True)
    subtotal = serializers.SerializerMethodField()
    discount_total = serializers.SerializerMethodField()
    total_discount = serializers.SerializerMethodField()
    address = serializers.SerializerMethodField()
    tracking = serializers.SerializerMethodField()
    assigned_card_id = serializers.IntegerField(read_only=True)
    payment_method_display = serializers.CharField(source="get_payment_method_display", read_only=True)
    payment_status_display = serializers.SerializerMethodField()
    delivery = serializers.SerializerMethodField()
    account = serializers.SerializerMethodField()

    class Meta:
        model = Order
        fields = [
            "id",
            "order_number",
            "customer_id",
            "customer_name",
            "customer_email",
            "customer_phone",
            "items",
            "amount",
            "subtotal",
            "discount_total",
            "first_order_discount_percentage",
            "first_order_discount_amount",
            "total_discount",
            "shipping",
            "total",
            "payment_method",
            "payment_method_display",
            "payment_status",
            "payment_status_display",
            "status",
            "address",
            "delivery",
            "account",
            "tracking",
            "assigned_card_id",
            "placed_at",
        ]
        read_only_fields = fields

    def get_subtotal(self, obj):
        return sum(((item.original_price or item.price) * item.qty for item in obj.items.all()), Decimal("0.00"))

    def get_discount_total(self, obj):
        return sum((((item.discount_amount or Decimal("0.00")) * item.qty) for item in obj.items.all()), Decimal("0.00"))

    def get_total_discount(self, obj):
        return self.get_discount_total(obj) + (obj.first_order_discount_amount or Decimal("0.00"))

    def get_address(self, obj):
        return {
            "line1": obj.shipping_line1,
            "city": obj.shipping_city,
            "state": obj.shipping_state,
            "pincode": obj.shipping_pincode,
            "country": obj.shipping_country,
        }

    def get_payment_status_display(self, obj):
        label = obj.get_payment_status_display()
        if obj.payment_method == Order.PaymentMethod.DUMMY and obj.payment_status == Order.PaymentStatus.PAID:
            return f"{label} (Test)"
        return label

    def get_delivery(self, obj):
        """Full delivery details: every field the buyer entered at checkout
        when the order came from one, otherwise the order's own snapshot."""
        session = getattr(obj, "checkout_session", None)
        if session is not None:
            return {
                "full_name": session.full_name,
                "phone": session.phone,
                "email": session.email,
                "address_line1": session.address_line1,
                "address_line2": session.address_line2,
                "landmark": session.landmark,
                "locality": session.locality,
                "city": session.city,
                "district": session.district,
                "state": session.state,
                "pincode": session.pincode,
                "country": session.country,
            }
        return {
            "full_name": obj.customer.full_name,
            "phone": obj.customer.phone,
            "email": obj.customer.email,
            "address_line1": obj.shipping_line1,
            "address_line2": "",
            "landmark": "",
            "locality": "",
            "city": obj.shipping_city,
            "district": "",
            "state": obj.shipping_state,
            "pincode": obj.shipping_pincode,
            "country": obj.shipping_country,
        }

    def get_account(self, obj):
        """Customer account status for this order (accounts/onboarding.py)."""
        from accounts.models import CustomerOnboarding

        user = obj.customer
        item = CustomerOnboarding.objects.filter(user=user).first()
        if item is None:
            status = CustomerOnboarding.AccountStatus.ACTIVATED if not user.must_change_password else CustomerOnboarding.AccountStatus.PENDING_PROCESSING
            return {"status": status, "status_display": status.label, "onboarding_id": None, "created_from_order": False}
        status = item.account_status
        return {
            "status": status,
            "status_display": CustomerOnboarding.AccountStatus(status).label,
            "onboarding_id": item.pk,
            "created_from_order": True,
            "email_status": item.email_status,
            "email_attempts": item.email_attempts,
            "email_last_error": item.email_last_error,
            "email_sent_at": item.email_sent_at,
            "activation_link_issued_at": item.credentials_issued_at,
            "password_set_at": item.password_set_at,
        }

    def get_tracking(self, obj):
        cancelled = obj.status == Order.Status.CANCELLED
        steps = []
        for i, (field, label) in enumerate(zip(STEP_FIELDS, TRACKING_LABELS)):
            if cancelled:
                done = i == 0
                date = obj.placed_at if done else None
            else:
                date = getattr(obj, field)
                done = date is not None
            steps.append({"label": label, "date": date, "done": done})
        return steps


class OrderItemWriteSerializer(serializers.Serializer):
    product_id = serializers.CharField(max_length=40)
    name = serializers.CharField(max_length=150)
    # Same choice list the customer-facing checkout accepts (NfcCard types
    # plus the Google Review Card's order-item-only "REVIEW" type) — an
    # admin manually entering an offline order needs to be able to record
    # either product, not just NFC cards.
    card_type = serializers.ChoiceField(choices=ORDER_ITEM_CARD_TYPE_CHOICES)
    color = serializers.CharField(max_length=30)
    qty = serializers.IntegerField(min_value=1)
    price = serializers.DecimalField(max_digits=10, decimal_places=2, min_value=0)


class AdminOrderCreateSerializer(serializers.Serializer):
    """Manual/offline order entry — real orders otherwise only exist once a
    public checkout flow is built (see the reports on remaining
    dependencies). Not tied to a payment gateway; `payment_status` is set
    directly by the admin."""

    customer_email = serializers.EmailField()
    items = OrderItemWriteSerializer(many=True)
    shipping = serializers.DecimalField(max_digits=10, decimal_places=2, required=False, default=0)
    payment_method = serializers.ChoiceField(choices=Order.PaymentMethod.choices)
    payment_status = serializers.ChoiceField(
        choices=Order.PaymentStatus.choices, required=False, default=Order.PaymentStatus.PENDING
    )
    shipping_line1 = serializers.CharField(max_length=255)
    shipping_city = serializers.CharField(max_length=100)
    shipping_state = serializers.CharField(max_length=100)
    shipping_pincode = serializers.CharField(max_length=12)
    shipping_country = serializers.CharField(max_length=100, required=False, default="India")

    def validate_customer_email(self, value):
        value = value.strip().lower()
        customer = User.objects.filter(email=value, role=User.Role.CUSTOMER).first()
        if customer is None:
            raise serializers.ValidationError("No customer account found with that email.")
        return value

    def validate_items(self, value):
        if not value:
            raise serializers.ValidationError("At least one item is required.")
        return value


class AdminOrderStatusSerializer(serializers.Serializer):
    status = serializers.ChoiceField(choices=Order.Status.choices)


class AdminOrderAssignCardSerializer(serializers.Serializer):
    card_id = serializers.IntegerField()
