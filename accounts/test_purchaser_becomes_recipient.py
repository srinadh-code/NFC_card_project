"""Purchaser <-> recipient on one account, end to end.

Real checkout, payment, admin "Processing", email delivery, set-password and
login paths. Cases from the business rules:

A. New purchaser buying for someone new.
B. Existing purchaser buying for someone new.
C. Existing purchaser becoming a recipient (buying for themselves).
D. Existing recipient becoming a purchaser.
E. An email that already holds an NFC card stays protected.
"""

from unittest import mock

from django.core import mail
from django.test import override_settings
from django.urls import reverse
from rest_framework.test import APITestCase

from accounts import onboarding
from accounts.models import EmailOTP, User
from accounts.roles import roles_for
from nfc_cards.models import NfcCard
from orders.models import RecipientEmailAllocation
from payments import test_purchaser_setup as setup_fixtures
from payments.tests import KEY_SECRET, WEBHOOK_SECRET, _guest_payload
from profiles.models import Profile

A = "person.a@example.com"
B = "person.b@example.com"
C = "person.c@example.com"
PASSWORD = setup_fixtures.PASSWORD
_fixtures = setup_fixtures.PurchaserSetupTests


def recipient(email):
    return {"full_name": "Recipient", "email": email, "phone": "9876543210"}


@override_settings(
    RAZORPAY_KEY_ID="rzp_test_key",
    RAZORPAY_KEY_SECRET=KEY_SECRET,
    RAZORPAY_WEBHOOK_SECRET=WEBHOOK_SECRET,
    DUMMY_PAYMENTS_ENABLED=True,
    ONBOARDING_EMAIL_SYNC=True,
    BREVO_API_KEY="",
    EMAIL_BACKEND="django.core.mail.backends.locmem.EmailBackend",
    FRONTEND_URL="https://shop.example.com",
    PASSWORD_HASHERS=["django.contrib.auth.hashers.MD5PasswordHasher"],
)
class PurchaserBecomesRecipientTests(APITestCase):
    setUp = _fixtures.setUp
    _fake_create_order = _fixtures._fake_create_order
    _with_token = _fixtures._with_token
    _checkout = _fixtures._checkout
    _verify = _fixtures._verify
    _email_token = _fixtures._email_token
    _pay = _fixtures._pay
    _setup_messages = _fixtures._setup_messages
    _recipient_messages = _fixtures._recipient_messages
    _token = _fixtures._token
    _complete = _fixtures._complete
    _processing = _fixtures._processing

    # -- helpers ---------------------------------------------------------

    def _payload(self, buyer, emails):
        payload = _guest_payload(email=buyer, qty=len(emails))
        payload["recipients"] = [recipient(value) for value in emails]
        payload["provider"] = "razorpay"
        return payload

    def _buy(self, buyer, emails):
        _, order = self._pay(self._checkout(self._payload(buyer, emails)))
        return order

    def _messages_to(self, email, subject=None):
        return [m for m in mail.outbox if m.to == [email] and (subject is None or m.subject == subject)]

    def _ready_notices(self, email):
        return self._messages_to(email, onboarding.CARD_READY_SUBJECT)

    def _available(self, email, buyer):
        response = self.client.post(
            reverse("recipient-email-availability"), {"email": email, "buyer_email": buyer}, format="json",
        )
        self.assertEqual(response.status_code, 200, response.content)
        return response.data["data"]["available"]

    def _login(self, email, password=PASSWORD):
        response = self.client.post(reverse("auth-login"), {"email": email, "password": password}, format="json")
        self.assertEqual(response.status_code, 200, response.content)
        return response.data["data"]

    def _activate_purchaser(self):
        self.assertEqual(self._complete(self._token(self._setup_messages()[-1])).status_code, 200)

    def _activate_recipient(self, email):
        message = self._messages_to(email, onboarding.ACTIVATION_SUBJECT)[-1]
        self.assertEqual(self._complete(self._token(message), purpose="recipient").status_code, 200)

    def _both_dashboards(self, email):
        auth = self._login(email)
        self.assertEqual(auth["user"]["roles"], ["PURCHASER", "RECIPIENT"])
        headers = {"HTTP_AUTHORIZATION": f"Bearer {auth['access']}"}
        self.assertEqual(self.client.get(reverse("customer-dashboard"), **headers).status_code, 200)
        self.assertEqual(self.client.get(reverse("profile-me"), **headers).status_code, 200)
        self.assertEqual(self.client.get(reverse("my-orders"), **headers).status_code, 200)

    # -- A. new purchaser + new recipient --------------------------------

    def test_new_purchaser_buying_for_someone_else_gets_setup_and_recipient_gets_activation(self):
        order = self._buy(A, [B])
        self.assertEqual(len(self._setup_messages()), 1)
        self.assertEqual(self._setup_messages()[0].to, [A])
        self._processing(order)
        self.assertEqual(len(self._messages_to(B, onboarding.ACTIVATION_SUBJECT)), 1)
        self.assertEqual(self._messages_to(A, onboarding.ACTIVATION_SUBJECT), [])
        self.assertEqual(roles_for(User.objects.get(email=A)), ["PURCHASER"])

    # -- B. existing purchaser + new recipient ---------------------------

    def test_existing_purchaser_buying_for_another_new_person_reuses_account(self):
        self._buy(A, [B])
        self._activate_purchaser()
        password_hash = User.objects.get(email=A).password
        order = self._buy(A, [C])
        self._processing(order)
        self.assertEqual(User.objects.filter(email=A).count(), 1)
        self.assertEqual(User.objects.get(email=A).password, password_hash)
        self.assertEqual(len(self._setup_messages()), 1, "no second purchaser setup email")
        self.assertEqual(len(self._messages_to(C, onboarding.ACTIVATION_SUBJECT)), 1)

    # -- C. existing purchaser becomes recipient -------------------------

    def test_activated_purchaser_buying_for_themselves_gets_card_ready_email_and_both_dashboards(self):
        self._buy(A, [B])
        self._activate_purchaser()
        buyer = User.objects.get(email=A)
        password_hash = buyer.password

        self.assertTrue(self._available(A, A), "a purchaser's own email can become a recipient")
        order = self._buy(A, [A])
        self.assertEqual(order.customer_id, buyer.pk)
        self.assertEqual(order.recipients.get().user_id, buyer.pk)

        self._processing(order)
        notices = self._ready_notices(A)
        self.assertEqual(len(notices), 1, "the existing account is told its card is ready")
        self.assertNotIn("token=", notices[0].body, "an active account is never sent a password link")
        self.assertIn("/login", notices[0].body)
        self.assertEqual(self._messages_to(A, onboarding.ACTIVATION_SUBJECT), [])
        self.assertEqual(len(self._setup_messages()), 1, "no second purchaser setup email")

        buyer.refresh_from_db()
        self.assertEqual(buyer.password, password_hash)
        self.assertEqual(User.objects.filter(email__iexact=A).count(), 1)
        self.assertEqual(Profile.objects.filter(user=buyer).count(), 1)
        self._both_dashboards(A)

        # Running the activation step for this order again (e.g. its status
        # moved back and forth) sends nothing new.
        with self.captureOnCommitCallbacks(execute=True):
            self.assertEqual(onboarding.start_activation_for_order(order, sync=True), "active")
        self.assertEqual(len(self._ready_notices(A)), 1)
        self.assertEqual(order.recipients.get().invitation_status, "SENT")

    def test_pending_purchaser_buying_for_themselves_gets_one_recipient_activation_path(self):
        self._buy(A, [B])
        purchaser_token = self._token(self._setup_messages()[-1])
        order = self._buy(A, [A])
        self._processing(order)
        activation = self._messages_to(A, onboarding.ACTIVATION_SUBJECT)
        self.assertEqual(len(activation), 1)
        self.assertEqual(len(self._setup_messages()), 1)
        # The older purchaser link no longer works; the recipient one does.
        self.assertNotEqual(self._complete(purchaser_token).status_code, 200)
        self._activate_recipient(A)
        self.assertEqual(User.objects.filter(email__iexact=A).count(), 1)
        self._both_dashboards(A)

    # -- D. existing recipient becomes purchaser -------------------------

    def test_existing_recipient_buying_for_someone_else_keeps_password_and_gains_purchaser(self):
        order = self._buy(C, [B])
        self._processing(order)
        self._activate_recipient(B)
        recipient_user = User.objects.get(email=B)
        password_hash = recipient_user.password
        mail.outbox.clear()

        self._buy(B, [A])
        recipient_user.refresh_from_db()
        self.assertEqual(recipient_user.password, password_hash)
        self.assertEqual(User.objects.filter(email__iexact=B).count(), 1)
        self.assertEqual(self._setup_messages(), [], "an active account gets no purchaser setup email")
        self._both_dashboards(B)

    # -- E. an email already holding a card stays protected --------------

    def test_email_already_holding_an_nfc_card_cannot_be_allocated_again(self):
        self._buy(A, [B])
        self._activate_purchaser()
        buyer = User.objects.get(email=A)
        NfcCard.objects.create(uid="A-CARD", serial_number="SN-A", user=buyer, status="ACTIVE")
        self.assertFalse(self._available(A, A))
        response = self.client.post(
            reverse("razorpay-checkout"), self._with_token(self._payload(A, [A])), format="json",
        )
        self.assertEqual(response.status_code, 400, response.content)
        self.assertIn("recipients", response.data["errors"])

    def test_recipient_already_allocated_on_a_paid_order_stays_protected(self):
        self._buy(A, [B])
        self.assertFalse(self._available(B, C))
        self.assertFalse(self._available(B, A))
        allocation = RecipientEmailAllocation.objects.get(normalized_email=B)
        self.assertTrue(allocation.recipients.exists())

    def test_card_ready_notice_is_not_an_activation_link_and_issues_no_token(self):
        self._buy(A, [B])
        self._activate_purchaser()
        order = self._buy(A, [A])
        tokens_before = EmailOTP.objects.filter(user__email=A).count()
        self._processing(order)
        self.assertEqual(EmailOTP.objects.filter(user__email=A).count(), tokens_before)

    def test_card_ready_delivery_failure_never_blocks_processing_and_is_recorded_for_retry(self):
        self._buy(A, [B])
        self._activate_purchaser()
        order = self._buy(A, [A])
        with mock.patch("accounts.onboarding.send_email", side_effect=RuntimeError("smtp down")):
            self._processing(order)  # still 200 — asserted inside the fixture
        allocation = order.recipients.get()
        self.assertEqual(allocation.invitation_status, "FAILED")
        self.assertIsNone(allocation.invitation_sent_at)
        self.assertEqual(self._ready_notices(A), [])
        # The cleared claim lets the next activation run deliver it.
        with self.captureOnCommitCallbacks(execute=True):
            onboarding.start_activation_for_order(order, sync=True)
        self.assertEqual(len(self._ready_notices(A)), 1)


# Only the fixture methods are borrowed; keep the runner from collecting
# (and re-running) the fixture TestCase through this module.
del _fixtures
