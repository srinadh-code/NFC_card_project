from django.test import override_settings
from django.urls import reverse
from rest_framework.test import APITestCase

from accounts.models import User
from common.test_utils import make_user
from nfc_cards.models import NfcCard
from orders.models import Order, OrderItem, OrderRecipient, Transaction
from profiles.models import Profile


@override_settings(PASSWORD_HASHERS=["django.contrib.auth.hashers.MD5PasswordHasher"], BREVO_API_KEY="",
                   EMAIL_BACKEND="django.core.mail.backends.locmem.EmailBackend")
class CardAssignmentEmailTests(APITestCase):
    def setUp(self):
        self.admin = make_user("card-admin@example.com", role=User.Role.ADMIN, is_staff=True)
        self.client.force_authenticate(self.admin)

    def customer(self, email, name="Srinadh"):
        user = make_user(email, full_name=name)
        Profile.ensure_for_user(user)
        return user

    def add(self, email, **extra):
        return self.client.post(reverse("admin-cards"), {"customer_email": email, "status": "ASSIGNED", **extra}, format="json")

    def choices(self, **params):
        response = self.client.get(reverse("admin-card-assignment-customers"), params)
        self.assertEqual(response.status_code, 200, response.data)
        return response

    def test_second_card_for_assigned_email_is_rejected_without_creating_inventory(self):
        user = self.customer("srinadh@gmail.com")
        self.assertEqual(self.add(user.email).status_code, 201)
        response = self.add("  SRINADH@GMAIL.COM  ")
        self.assertEqual(response.status_code, 400, response.data)
        self.assertEqual(NfcCard.objects.count(), 1)
        self.assertEqual(NfcCard.objects.get().user_id, user.pk)

    def test_card_inventory_emails_follow_linked_customer_ids_when_names_match(self):
        customers = [self.customer(email, "Srinadh") for email in ("srinadh1@gmail.com", "srinadh2@gmail.com")]
        expected = {}
        for customer in customers:
            response = self.add(customer.email)
            self.assertEqual(response.status_code, 201, response.data)
            expected[response.data["data"]["id"]] = (customer.pk, customer.email)
        unassigned = NfcCard.objects.create(uid="EMAIL-UNASSIGNED", serial_number="EMAIL-UNASSIGNED-SN")
        response = self.client.get(reverse("admin-cards"))
        self.assertEqual(response.status_code, 200, response.data)
        rows = {row["id"]: row for row in response.data["data"]}
        for card_id, (customer_id, email) in expected.items():
            self.assertEqual(rows[card_id]["customer_name"], "Srinadh")
            self.assertEqual((rows[card_id]["customer_id"], rows[card_id]["customer_email"]), (customer_id, email))
        self.assertIsNone(rows[unassigned.pk]["customer_id"])
        self.assertIsNone(rows[unassigned.pk]["customer_email"])

    def test_assigned_email_disappears_and_same_name_different_email_remains(self):
        first = self.customer("srinadh1@gmail.com")
        second = self.customer("srinadh2@gmail.com")
        self.assertCountEqual([row["email"] for row in self.choices().data["data"]], [first.email, second.email])
        self.assertEqual(self.add(first.email).status_code, 201)
        self.assertEqual([row["email"] for row in self.choices().data["data"]], [second.email])
        # The normal Customers directory retains both people.
        directory = self.client.get(reverse("admin-customers"))
        self.assertCountEqual([row["email"] for row in directory.data["data"]], [first.email, second.email])

    def test_different_names_with_same_normalized_email_are_one_assignment_identity(self):
        first = self.customer("same@gmail.com", "Srinadh")
        alias = User.objects.create(email="  SAME@GMAIL.COM  ", full_name="Vinay", role=User.Role.CUSTOMER)
        Profile.ensure_for_user(alias)
        self.assertEqual(self.choices().data["pagination"]["count"], 1)
        NfcCard.objects.create(uid="ALIAS-CARD", serial_number="ALIAS-SERIAL", user=alias, status="ASSIGNED")
        self.assertEqual(self.choices().data["data"], [])
        self.assertEqual(self.choices(search="Srinadh").data["data"], [])
        self.assertEqual(self.choices(search="Vinay").data["data"], [])
        self.assertEqual(self.add(first.email).status_code, 400)
        self.assertEqual(NfcCard.objects.count(), 1)

    def test_unassigned_customer_remains_available_and_can_be_assigned(self):
        user = self.customer("kavya@gmail.com", "Kavya")
        self.assertEqual([row["email"] for row in self.choices().data["data"]], [user.email])
        self.assertEqual(self.add("  KAVYA@GMAIL.COM  ").status_code, 201)
        self.assertEqual(self.choices().data["data"], [])

    def test_any_owned_card_status_excludes_email(self):
        user = self.customer("srinadh@gmail.com")
        card = NfcCard.objects.create(uid="OWNED", serial_number="OWNED-SERIAL", user=user)
        for status in NfcCard.Status.values:
            with self.subTest(status=status):
                NfcCard.objects.filter(pk=card.pk).update(status=status)
                self.assertEqual(self.choices().data["data"], [])
                self.assertEqual(self.add(user.email).status_code, 400)

    def test_quick_assign_and_patch_cannot_bypass_email_limit(self):
        user = self.customer("srinadh@gmail.com")
        self.assertEqual(self.add(user.email).status_code, 201)
        spare = NfcCard.objects.create(uid="SPARE", serial_number="SPARE-SERIAL")
        for response in (
            self.client.post(reverse("admin-card-assign", args=[spare.pk]), {"email": " SRINADH@GMAIL.COM "}, format="json"),
            self.client.patch(reverse("admin-card-detail", args=[spare.pk]), {"customer_email": user.email}, format="json"),
        ):
            self.assertEqual(response.status_code, 400, response.data)
        spare.refresh_from_db()
        self.assertIsNone(spare.user_id)
        self.assertEqual(spare.status, "UNASSIGNED")

    def test_editing_existing_assignment_and_repeating_same_assignment_preserve_card(self):
        user = self.customer("srinadh@gmail.com")
        card_id = self.add(user.email).data["data"]["id"]
        card = NfcCard.objects.get(pk=card_id)
        assigned_on = card.assigned_on
        response = self.client.patch(reverse("admin-card-detail", args=[card_id]),
                                     {"customer_email": " SRINADH@GMAIL.COM ", "notes": "Keep this assignment"}, format="json")
        self.assertEqual(response.status_code, 200, response.data)
        response = self.client.post(reverse("admin-card-assign", args=[card_id]), {"email": user.email}, format="json")
        self.assertEqual(response.status_code, 200, response.data)
        card.refresh_from_db()
        self.assertEqual((card.user_id, card.assigned_on, card.notes), (user.pk, assigned_on, "Keep this assignment"))
        self.assertEqual(NfcCard.objects.count(), 1)

    def test_historical_duplicate_cards_are_preserved_and_cannot_be_increased(self):
        user = self.customer("same@gmail.com")
        first = NfcCard.objects.create(uid="HIST-1", serial_number="HIST-SERIAL-1", user=user, status="ACTIVE")
        NfcCard.objects.create(uid="HIST-2", serial_number="HIST-SERIAL-2", user=user, status="ASSIGNED")
        response = self.client.patch(reverse("admin-card-detail", args=[first.pk]),
                                     {"customer_email": user.email, "notes": "Historical note"}, format="json")
        self.assertEqual(response.status_code, 200, response.data)
        self.assertEqual(self.add(user.email).status_code, 400)
        self.assertEqual(NfcCard.objects.filter(user=user).count(), 2)
        self.assertEqual(self.choices().data["data"], [])

    def test_assigned_emails_are_excluded_before_search_and_pagination(self):
        for index in range(11):
            user = self.customer(f"assigned{index}@example.com")
            NfcCard.objects.create(uid=f"PAGE-{index}", serial_number=f"PAGE-SN-{index}", user=user)
        self.customer("kavya@gmail.com", "Kavya")
        self.customer("rahul@gmail.com", "Rahul")
        response = self.choices(page_size=1)
        self.assertEqual(response.data["pagination"]["count"], 2)
        self.assertEqual(response.data["pagination"]["num_pages"], 2)
        self.assertEqual(len(response.data["data"]), 1)
        self.assertEqual([row["email"] for row in self.choices(search="kavya").data["data"]], ["kavya@gmail.com"])

    def test_assignment_lookup_requires_admin(self):
        user = self.customer("kavya@gmail.com", "Kavya")
        self.client.force_authenticate(user)
        self.assertEqual(self.client.get(reverse("admin-card-assignment-customers")).status_code, 403)

    def test_order_assignment_cannot_assign_a_second_card_to_the_same_email(self):
        user = self.customer("srinadh@gmail.com")
        self.assertEqual(self.add(user.email).status_code, 201)
        spare = NfcCard.objects.create(uid="ORDER-SPARE", serial_number="ORDER-SPARE-SERIAL")
        order = Order.objects.create(customer=user, amount="100.00", payment_method="RAZORPAY", payment_status="PAID",
                                     shipping_line1="Saved address", shipping_city="Hyderabad", shipping_state="Telangana", shipping_pincode="500001")
        OrderItem.objects.create(order=order, product_id="custom", name="Custom Card", card_type="CUSTOM", color="Black", qty=1, price="100.00")
        Transaction.objects.create(order=order, amount="100.00", method="RAZORPAY", status="PAID")
        recipient = OrderRecipient.objects.create(order=order, user=user, profile=user.profile, name=user.full_name, email=user.email)
        response = self.client.post(reverse("admin-order-assign-card", args=[order.pk]),
                                    {"card_id": spare.pk, "recipient_id": recipient.pk}, format="json")
        self.assertEqual(response.status_code, 400, response.data)
        spare.refresh_from_db()
        recipient.refresh_from_db()
        self.assertIsNone(spare.user_id)
        self.assertIsNone(recipient.assigned_card_id)
        self.assertEqual(NfcCard.objects.filter(user=user).count(), 1)

    def test_uid_claim_cannot_bypass_the_email_assignment_limit(self):
        user = self.customer("srinadh@gmail.com")
        self.assertEqual(self.add(user.email).status_code, 201)
        spare = NfcCard.objects.create(uid="CLAIM-SPARE", serial_number="CLAIM-SPARE-SERIAL")
        self.client.force_authenticate(user)
        response = self.client.post(reverse("nfc-activate"), {"uid": spare.uid}, format="json")
        self.assertEqual(response.status_code, 400, response.data)
        spare.refresh_from_db()
        self.assertIsNone(spare.user_id)
        self.assertEqual(spare.status, "UNASSIGNED")

    def test_quick_assign_and_patch_accept_customers_without_an_assigned_card(self):
        for action in ("quick", "patch"):
            with self.subTest(action=action):
                user = self.customer(f"{action}@example.com")
                spare = NfcCard.objects.create(uid=f"NEW-{action}", serial_number=f"NEW-SN-{action}")
                if action == "quick":
                    response = self.client.post(reverse("admin-card-assign", args=[spare.pk]), {"email": user.email}, format="json")
                else:
                    response = self.client.patch(reverse("admin-card-detail", args=[spare.pk]), {"customer_email": user.email}, format="json")
                self.assertEqual(response.status_code, 200, response.data)
                spare.refresh_from_db()
                self.assertEqual(spare.user_id, user.pk)
                self.assertNotIn(user.email, [row["email"] for row in self.choices().data["data"]])

    def test_legacy_account_email_whitespace_is_compared_without_updating_the_account(self):
        user = User.objects.create(email="  KAVYA@GMAIL.COM  ", full_name="Kavya", role=User.Role.CUSTOMER)
        Profile.ensure_for_user(user)
        self.assertEqual([row["email"] for row in self.choices().data["data"]], ["kavya@gmail.com"])
        response = self.add("kavya@gmail.com")
        self.assertEqual(response.status_code, 201, response.data)
        self.assertEqual(self.choices().data["data"], [])
        user.refresh_from_db()
        self.assertEqual(user.email, "  KAVYA@GMAIL.COM  ")

