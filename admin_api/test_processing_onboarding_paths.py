"""All supported admin status edits use paid, idempotent recipient onboarding."""
from unittest.mock import patch

from django.contrib import admin
from django.core import mail
from django.forms import modelform_factory
from django.test import RequestFactory, override_settings
from django.urls import reverse
from rest_framework.test import APITestCase

from accounts import onboarding
from accounts.models import CustomerOnboarding, EmailOTP, User
from admin_api.orders.services import apply_status_transition
from common.test_utils import make_user
from orders.admin import OrderAdmin, OrderAdminForm
from orders.models import Order, OrderItem, OrderRecipient, Transaction


@override_settings(
    PASSWORD_HASHERS=["django.contrib.auth.hashers.MD5PasswordHasher"],
    ONBOARDING_EMAIL_SYNC=True,
    BREVO_API_KEY="",
    FRONTEND_URL="https://shop.example.com",
    EMAIL_BACKEND="django.core.mail.backends.locmem.EmailBackend",
)
class ProcessingOnboardingPathTests(APITestCase):
    def setUp(self):
        self.admin = make_user("processing-admin@example.com", role=User.Role.ADMIN, is_staff=True)
        self.buyer = make_user("processing-buyer@example.com")
        self.model_admin = OrderAdmin(Order, admin.site)

    def order(self, card_type="CUSTOM", payment_status="PAID", transaction_status="PAID"):
        order = Order.objects.create(
            customer=self.buyer, amount="100.00", payment_method="RAZORPAY", payment_status=payment_status,
            shipping_line1="Saved address", shipping_city="Hyderabad", shipping_state="Telangana", shipping_pincode="500001",
        )
        OrderItem.objects.create(order=order, product_id=card_type, name="Card", card_type=card_type,
                                 color="Black", qty=1, price="100.00")
        recipient = OrderRecipient.objects.create(order=order, card_type=card_type, name="Recipient",
                                                  email=f"recipient-{order.pk}@example.com")
        if transaction_status is not None:
            Transaction.objects.create(order=order, amount="100.00", method="RAZORPAY", status=transaction_status)
        return order, recipient

    def django_admin_save(self, order, status="PROCESSING"):
        request = RequestFactory().post("/admin/orders/order/")
        request.user = self.admin
        order.status = status
        with self.captureOnCommitCallbacks(execute=True):
            self.model_admin.save_model(request, order, None, change=True)

    def test_django_admin_processing_notifies_actual_digital_and_review_recipients_once(self):
        for card_type in ("CUSTOM", "REVIEW"):
            with self.subTest(card_type=card_type):
                order, recipient = self.order(card_type)
                self.django_admin_save(order)
                recipient.refresh_from_db()
                self.assertIsNotNone(recipient.user_id)
                messages = [m for m in mail.outbox if m.to == [recipient.email]]
                self.assertEqual(len(messages), 1)
                self.assertEqual(messages[0].subject, onboarding.ACTIVATION_SUBJECT)
                self.assertEqual(EmailOTP.objects.filter(user=recipient.user, purpose="ACTIVATE").count(), 1)
                self.assertIsNotNone(order.confirmed_at)
                self.django_admin_save(order)
                self.assertEqual(len([m for m in mail.outbox if m.to == [recipient.email]]), 1)
        self.assertEqual([m for m in mail.outbox if m.to == [self.buyer.email]], [])

    def test_shared_transition_rejects_unpaid_or_unverified_orders_without_side_effects(self):
        for payment_status, transaction_status in (("PENDING", "PAID"), ("PAID", None), ("PAID", "FAILED")):
            with self.subTest(payment_status=payment_status, transaction_status=transaction_status):
                order, recipient = self.order(payment_status=payment_status, transaction_status=transaction_status)
                with self.assertRaisesMessage(ValueError, "no successful payment"):
                    apply_status_transition(order, "PROCESSING")
                order.refresh_from_db()
                recipient.refresh_from_db()
                self.assertEqual(order.status, "PENDING")
                self.assertIsNone(recipient.user_id)
        self.assertEqual(mail.outbox, [])

    def test_django_admin_form_rejects_unverified_payment_and_cancelled_transition(self):
        form_type = modelform_factory(Order, form=OrderAdminForm, fields=("status", "payment_status"))
        order, _ = self.order(transaction_status=None)
        form = form_type({"status": "PROCESSING", "payment_status": "PAID"}, instance=order)
        self.assertFalse(form.is_valid())
        self.assertIn("successful payment", str(form.errors["status"]))
        Order.objects.filter(pk=order.pk).update(status="CANCELLED")
        order.refresh_from_db()
        form = form_type({"status": "PROCESSING", "payment_status": "PAID"}, instance=order)
        self.assertFalse(form.is_valid())
        self.assertIn("cancelled", str(form.errors["status"]))

    def test_rest_processing_retries_use_shared_service_without_duplicate_issuance(self):
        order, recipient = self.order("REVIEW")
        self.client.force_authenticate(self.admin)
        for _ in range(2):
            with self.captureOnCommitCallbacks(execute=True):
                response = self.client.post(reverse("admin-order-status", args=[order.pk]), {"status": "PROCESSING"})
            self.assertEqual(response.status_code, 200, response.data)
        recipient.refresh_from_db()
        self.assertEqual(EmailOTP.objects.filter(user=recipient.user, purpose="ACTIVATE").count(), 1)
        self.assertEqual(len(mail.outbox), 1)

    def test_non_admin_cannot_start_processing_through_rest_or_django_admin(self):
        order, _ = self.order()
        self.client.force_authenticate(self.buyer)
        response = self.client.post(reverse("admin-order-status", args=[order.pk]), {"status": "PROCESSING"})
        self.assertEqual(response.status_code, 403)
        self.client.force_authenticate(None)
        self.client.force_login(self.buyer)
        response = self.client.post(reverse("admin:orders_order_change", args=[order.pk]), {"status": "PROCESSING"})
        self.assertEqual(response.status_code, 302)
        order.refresh_from_db()
        self.assertEqual(order.status, "PENDING")
        self.assertEqual(mail.outbox, [])

    def test_processing_service_defers_email_until_commit(self):
        order, _ = self.order()
        with self.captureOnCommitCallbacks(execute=False) as callbacks:
            apply_status_transition(order, "PROCESSING")
        self.assertEqual(len(callbacks), 1)
        self.assertEqual(mail.outbox, [])

    def test_repeated_processing_revalidates_payment_before_onboarding(self):
        order, _ = self.order()
        Order.objects.filter(pk=order.pk).update(status="PROCESSING", payment_status="REFUNDED")
        self.client.force_authenticate(self.admin)
        with patch("accounts.onboarding.start_activation_for_order") as start:
            response = self.client.post(reverse("admin-order-status", args=[order.pk]), {"status": "PROCESSING"})
        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.data["errors"]["code"], "payment_required")
        start.assert_not_called()

    def test_repeated_processing_recovers_failed_dispatch_and_supersedes_failed_link(self):
        for card_type in ("CUSTOM", "REVIEW"):
            with self.subTest(card_type=card_type):
                order, recipient = self.order(card_type)
                self.client.force_authenticate(self.admin)
                with patch("accounts.onboarding._send", return_value=False), self.captureOnCommitCallbacks(execute=True):
                    first = self.client.post(reverse("admin-order-status", args=[order.pk]), {"status": "PROCESSING"})
                self.assertEqual(first.status_code, 200)
                recipient.refresh_from_db()
                item = CustomerOnboarding.objects.get(user=recipient.user)
                self.assertEqual(item.email_status, "FAILED")
                failed_token = EmailOTP.objects.get(user=recipient.user, purpose="ACTIVATE", is_used=False)
                with self.captureOnCommitCallbacks(execute=True):
                    retry = self.client.post(reverse("admin-order-status", args=[order.pk]), {"status": "PROCESSING"})
                self.assertEqual(retry.status_code, 200)
                item.refresh_from_db()
                failed_token.refresh_from_db()
                self.assertEqual(item.email_status, "SENT")
                self.assertTrue(failed_token.is_used)
                self.assertEqual(EmailOTP.objects.filter(user=recipient.user, purpose="ACTIVATE", is_used=False).count(), 1)
                self.assertEqual(len([m for m in mail.outbox if m.to == [recipient.email]]), 1)

    def test_activation_uses_product_context_of_order_entering_processing(self):
        digital, first_slot = self.order("CUSTOM")
        onboarding.ensure_recipient_accounts(digital)
        review, review_slot = self.order("REVIEW")
        review_slot.email = first_slot.email
        review_slot.save(update_fields=["email"])
        self.django_admin_save(review)
        messages = [m for m in mail.outbox if m.to == [first_slot.email]]
        self.assertEqual(len(messages), 1)
        self.assertIn("Google Review workspace", messages[0].body)
        self.assertIn(review.order_number, messages[0].body)
        self.assertNotIn(digital.order_number, messages[0].body)

    @override_settings(ONBOARDING_EMAIL_SYNC=False)
    def test_queued_activation_rechecks_payment_and_cancellation_before_dispatch(self):
        for state in ("REFUNDED", "CANCELLED", "NO_PAID_TRANSACTION"):
            with self.subTest(state=state):
                order, _ = self.order("REVIEW")
                with patch("accounts.onboarding.threading.Thread") as thread:
                    self.django_admin_save(order)
                worker = thread.call_args.kwargs["target"]
                if state == "CANCELLED":
                    Order.objects.filter(pk=order.pk).update(status=state)
                elif state == "REFUNDED":
                    Order.objects.filter(pk=order.pk).update(payment_status=state)
                else:
                    Transaction.objects.filter(order=order).delete()
                with patch("accounts.onboarding.connection.close"), patch("accounts.onboarding._send") as send:
                    worker()
                send.assert_not_called()
        self.assertEqual(mail.outbox, [])
