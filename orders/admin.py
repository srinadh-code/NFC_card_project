from django import forms
from django.contrib import admin
from django.db import transaction

from admin_api.orders.services import apply_status_transition

from .models import Order, OrderItem, Transaction


class OrderItemInline(admin.TabularInline):
    model = OrderItem
    extra = 0


class TransactionInline(admin.TabularInline):
    model = Transaction
    extra = 0


class OrderAdminForm(forms.ModelForm):
    class Meta:
        model = Order
        fields = "__all__"

    def clean(self):
        data = super().clean()
        status = data.get("status")
        previous = Order.objects.filter(pk=self.instance.pk).values_list("status", flat=True).first()
        if previous == Order.Status.CANCELLED and status != previous:
            self.add_error("status", "Cannot change the status of a cancelled order.")
        if status == Order.Status.PROCESSING and (
            data.get("payment_status") != Order.PaymentStatus.PAID
            or self.instance.pk is None
            or not Transaction.objects.filter(order_id=self.instance.pk, status=Order.PaymentStatus.PAID).exists()
        ):
            self.add_error("status", "A successful payment is required before moving this order to Processing.")
        return data


@admin.register(Order)
class OrderAdmin(admin.ModelAdmin):
    form = OrderAdminForm
    list_display = ["id", "customer", "status", "payment_status", "amount", "placed_at"]
    list_filter = ["status", "payment_status", "payment_method"]
    search_fields = ["id", "customer__email", "customer__full_name"]
    readonly_fields = ["placed_at", "updated_at"]
    inlines = [OrderItemInline, TransactionInline]

    @transaction.atomic
    def save_model(self, request, obj, form, change):
        requested_status = obj.status
        previous_status = Order.objects.select_for_update().get(pk=obj.pk).status if change else Order.Status.PENDING
        # Save the other edited fields without bypassing the shared transition
        # service. Its postcommit callbacks cannot run before all admin inlines
        # and the surrounding change-form transaction have committed.
        obj.status = previous_status
        super().save_model(request, obj, form, change)
        if requested_status != previous_status or requested_status == Order.Status.PROCESSING:
            apply_status_transition(obj, requested_status)


@admin.register(Transaction)
class TransactionAdmin(admin.ModelAdmin):
    list_display = ["id", "order", "amount", "method", "status", "created_at"]
    list_filter = ["method", "status"]
    search_fields = ["id", "order__id"]
    readonly_fields = ["created_at"]
