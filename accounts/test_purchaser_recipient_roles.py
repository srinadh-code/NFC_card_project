"""Purchaser / recipient role separation (accounts/roles.py).

A purchaser-only account gets My Orders but never the Customer Dashboard or
a digital profile; a recipient gets the Customer Dashboard; one account can
hold both. Driven through the real checkout, payment, setup-link, login and
JWT paths, reusing the purchaser-setup test fixtures.
"""

from django.test import override_settings
from django.urls import reverse
from rest_framework.test import APITestCase

from accounts.models import User
from accounts.roles import roles_for
from common.test_utils import make_user
from payments import test_purchaser_setup as setup_fixtures
from payments.tests import KEY_SECRET, WEBHOOK_SECRET, _guest_payload
from profiles.models import CustomField, Profile, SocialLink

BUYER = "srinadh@example.com"
PASSWORD = setup_fixtures.PASSWORD
_fixtures = setup_fixtures.PurchaserSetupTests


def recipient(email, name="Recipient"):
    return {"full_name": name, "email": email, "phone": "+919876543210"}


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
class PurchaserRecipientRoleTests(APITestCase):
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

    def _buy(self, emails, email=BUYER):
        payload = _guest_payload(email=email, qty=len(emails))
        payload["recipients"] = [recipient(value) for value in emails]
        payload["provider"] = "razorpay"
        _, order = self._pay(self._checkout(payload))
        return order

    def _login(self, email, password=PASSWORD):
        response = self.client.post(reverse("auth-login"), {"email": email, "password": password}, format="json")
        self.assertEqual(response.status_code, 200, response.content)
        return response.data["data"]

    def _as(self, access):
        return {"HTTP_AUTHORIZATION": f"Bearer {access}"}

    def _purchaser_for_other(self):
        order = self._buy(["kavya@example.com"])
        self.assertEqual(self._complete(self._token()).status_code, 200)
        return order

    def _recipient_only_views(self):
        return [
            ("get", reverse("customer-dashboard")),
            ("get", reverse("profile-me")),
            ("get", reverse("customer-qr")),
            ("get", reverse("nfc-my-card")),
            ("get", reverse("customer-social-links")),
            ("get", reverse("social-link-list")),
        ]

    # -- Test 1: purchaser buys for someone else ---------------------------

    def test_purchaser_for_other_gets_my_orders_only_and_no_profile(self):
        order = self._purchaser_for_other()
        buyer = order.customer
        self.assertEqual([m.to for m in self._setup_messages()], [[BUYER]])
        self.assertFalse(Profile.objects.filter(user=buyer).exists())

        auth = self._login(BUYER)
        self.assertEqual(auth["user"]["roles"], ["PURCHASER"])
        self.assertEqual(auth["dashboard_url"], "/purchaser")
        headers = self._as(auth["access"])

        orders = self.client.get(reverse("my-orders"), **headers)
        self.assertEqual(orders.status_code, 200, orders.content)
        self.assertEqual([row["id"] for row in orders.data["data"]], [order.pk])
        self.assertEqual(self.client.get(reverse("my-order-detail", args=[order.pk]), **headers).status_code, 200)
        self.assertEqual(self.client.get(reverse("auth-me"), **headers).data["data"]["roles"], ["PURCHASER"])

        for method, url in self._recipient_only_views():
            with self.subTest(url=url):
                self.assertEqual(getattr(self.client, method)(url, **headers).status_code, 403)
        # Opening the dashboard/profile pages above must not have created one.
        self.assertFalse(Profile.objects.filter(user=buyer).exists())

    # -- Test 2: recipient activates ---------------------------------------

    def test_recipient_activation_gives_customer_dashboard_and_profile(self):
        order = self._buy(["kavya@example.com"])
        self._processing(order)
        message = next(m for m in self._recipient_messages() if m.to == ["kavya@example.com"])
        self.assertEqual(self._complete(self._token(message), purpose="recipient").status_code, 200)

        auth = self._login("kavya@example.com")
        self.assertEqual(auth["user"]["roles"], ["RECIPIENT"])
        self.assertEqual(auth["dashboard_url"], "/dashboard")
        headers = self._as(auth["access"])
        for method, url in self._recipient_only_views():
            with self.subTest(url=url):
                # Allowed (a QR code not generated yet is a 404, not a 403).
                self.assertNotEqual(getattr(self.client, method)(url, **headers).status_code, 403)
        self.assertEqual(self.client.get(reverse("customer-dashboard"), **headers).status_code, 200)
        updated = self.client.patch(reverse("profile-me"), {"company": "Kavya Studio"}, format="json", **headers)
        self.assertEqual(updated.status_code, 200, updated.content)
        self.assertEqual(Profile.objects.get(user__email="kavya@example.com").company, "Kavya Studio")
        # A recipient is not the buyer: the purchaser's order stays private.
        self.assertEqual(self.client.get(reverse("my-orders"), **headers).data["data"], [])
        self.assertEqual(self.client.get(reverse("my-order-detail", args=[order.pk]), **headers).status_code, 404)

    # -- Test 3: purchaser later becomes a recipient -----------------------

    def test_purchaser_who_later_receives_a_card_keeps_one_account_with_both_roles(self):
        first = self._purchaser_for_other()
        buyer = first.customer
        buyer.refresh_from_db()
        password_hash = buyer.password
        self.assertEqual(roles_for(buyer), ["PURCHASER"])

        second = self._buy([BUYER])
        self.assertEqual(second.customer_id, buyer.pk)
        self.assertEqual(second.recipients.get().user_id, buyer.pk)
        self.assertEqual(User.objects.filter(email__iexact=BUYER).count(), 1)
        buyer.refresh_from_db()
        self.assertEqual(buyer.password, password_hash, "existing password is not reset")
        self.assertEqual(roles_for(buyer), ["PURCHASER", "RECIPIENT"])

        auth = self._login(BUYER)  # same credentials as before
        self.assertEqual(auth["user"]["roles"], ["PURCHASER", "RECIPIENT"])
        self.assertEqual(auth["dashboard_url"], "/dashboard")
        headers = self._as(auth["access"])
        self.assertEqual(self.client.get(reverse("customer-dashboard"), **headers).status_code, 200)
        self.assertEqual(self.client.get(reverse("profile-me"), **headers).status_code, 200)
        orders = self.client.get(reverse("my-orders"), **headers).data["data"]
        self.assertCountEqual([row["id"] for row in orders], [first.pk, second.pk])
        self.assertEqual(Profile.objects.filter(user=buyer).count(), 1)

    # -- Test 4: admin side never turns a purchaser into a profile ---------

    def test_admin_profiles_never_include_or_create_a_purchaser_profile(self):
        order = self._purchaser_for_other()
        buyer = order.customer
        admin = make_user(email="profiles-admin@example.com", role=User.Role.ADMIN, is_staff=True)
        self.client.force_authenticate(admin)

        created = self.client.post(reverse("admin-profiles"), {"user_id": buyer.pk}, format="json")
        self.assertEqual(created.status_code, 400, created.content)
        self.assertEqual(created.data["errors"]["code"], "purchaser_only")
        self.assertFalse(Profile.objects.filter(user=buyer).exists())

        # A profile an older build auto-created stays in the database but is
        # not listed, not openable and grants no dashboard.
        legacy = Profile.ensure_for_user(buyer)
        listed = self.client.get(reverse("admin-profiles")).data["data"]
        self.assertNotIn(legacy.pk, [row["id"] for row in listed])
        self.assertIn(order.recipients.get().profile_id, [row["id"] for row in listed])
        self.assertEqual(self.client.get(reverse("admin-profile-detail", args=[legacy.pk])).status_code, 404)
        self.assertNotIn(buyer.pk, [row["id"] for row in self.client.get(reverse("admin-customers")).data["data"]])
        self.assertTrue(Profile.objects.filter(pk=legacy.pk).exists())
        self.assertEqual(roles_for(buyer), ["PURCHASER"])

    # -- Test 5: admin processing creates or reuses recipient accounts -----

    def test_processing_reuses_an_existing_recipient_account_without_touching_its_password(self):
        existing = make_user(email="kavya@example.com", password="Existing@123", full_name="Kavya")
        password_hash = existing.password
        order = self._buy(["kavya@example.com", "lakshmi@example.com"])
        self._processing(order)
        self.assertEqual(User.objects.filter(email__iexact="kavya@example.com").count(), 1)
        existing.refresh_from_db()
        self.assertEqual(existing.password, password_hash)
        self.assertEqual(order.recipients.get(email="kavya@example.com").user_id, existing.pk)
        new_recipient = User.objects.get(email="lakshmi@example.com")
        for user in (existing, new_recipient):
            with self.subTest(email=user.email):
                self.assertEqual(roles_for(user), ["RECIPIENT"])
                self.assertEqual(Profile.objects.filter(user=user).count(), 1)
        self.assertEqual([m.to for m in self._recipient_messages()], [["lakshmi@example.com"]])

    # -- Test 6: direct API requests are refused, not just hidden ----------

    def test_purchaser_cannot_create_profile_data_through_direct_api_requests(self):
        buyer = self._purchaser_for_other().customer
        headers = self._as(self._login(BUYER)["access"])
        attempts = [
            ("patch", reverse("profile-me"), {"company": "Mine"}),
            ("post", reverse("social-link-list"), {"platform": "linkedin", "url": "https://linkedin.com/in/x"}),
            ("put", reverse("custom-field-bulk"), {"fields": [{"label": "A", "value": "B"}]}),
            ("post", reverse("customer-qr-generate"), {}),
            ("post", reverse("nfc-activate"), {"uid": "ANY-UID"}),
        ]
        for method, url, body in attempts:
            with self.subTest(url=url):
                self.assertEqual(getattr(self.client, method)(url, body, format="json", **headers).status_code, 403)
        self.assertFalse(Profile.objects.filter(user=buyer).exists())
        self.assertFalse(SocialLink.objects.filter(profile__user=buyer).exists())
        self.assertFalse(CustomField.objects.filter(profile__user=buyer).exists())

    def test_recipients_cannot_reach_each_others_profile_data_and_customers_cannot_reach_admin(self):
        order = self._buy(["kavya@example.com", "lakshmi@example.com"])
        kavya = User.objects.get(email="kavya@example.com")
        lakshmi = User.objects.get(email="lakshmi@example.com")
        link = SocialLink.objects.create(profile=lakshmi.profile, platform="linkedin", url="https://linkedin.com/in/l")

        self.client.force_authenticate(kavya)
        self.assertEqual(self.client.get(reverse("social-link-detail", args=[link.pk])).status_code, 404)
        self.assertEqual(self.client.patch(reverse("social-link-detail", args=[link.pk]), {"url": "https://x.example"}, format="json").status_code, 404)
        self.assertEqual(self.client.get(reverse("profile-me")).data["data"]["username"], kavya.profile.username)
        self.assertEqual(self.client.get(reverse("admin-profiles")).status_code, 403)
        link.refresh_from_db()
        self.assertEqual(link.url, "https://linkedin.com/in/l")

        admin = make_user(email="roles-admin@example.com", role=User.Role.ADMIN, is_staff=True)
        self.client.force_authenticate(admin)
        self.assertEqual(self.client.get(reverse("admin-profiles")).status_code, 200)
        self.assertEqual(self.client.get(reverse("admin-purchasers")).status_code, 200)
        self.assertEqual(roles_for(admin), [])
        self.assertEqual(order.customer.email, BUYER)


# Only the fixture methods are borrowed; keep the runner from collecting
# (and re-running) the fixture TestCase through this module.
del _fixtures
