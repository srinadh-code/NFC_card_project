"""Exercise the product backfill against disposable historical schemas."""

from uuid import uuid4

from django.db import connection
from django.db.migrations.executor import MigrationExecutor
from django.test import TransactionTestCase


class ProductAllocationMigrationTests(TransactionTestCase):
    def setUp(self):
        executor = MigrationExecutor(connection)
        self.latest = executor.loader.graph.leaf_nodes()
        self.previous = [target for target in self.latest if target[0] != "orders"] + [
            ("orders", "0019_recipientemailallocation"),
        ]
        self.addCleanup(self.restore)
        executor.migrate(self.previous)
        self.old = executor.loader.project_state(self.previous).apps
        self.index = 0

    def restore(self):
        MigrationExecutor(connection).migrate(self.latest)

    def forward(self):
        executor = MigrationExecutor(connection)
        executor.migrate(self.latest)
        return executor.loader.project_state(self.latest).apps

    def identity(self):
        self.index += 1
        user = self.old.get_model("accounts", "User").objects.create(
            email=f"migration-{self.index}@example.com", full_name="Historical Recipient", role="CUSTOMER",
        )
        allocation = self.old.get_model("orders", "RecipientEmailAllocation").objects.create(
            normalized_email=user.email, owner_email="buyer@example.com",
        )
        return user, allocation

    def recipient(self, types, *, assigned_type=None):
        user, allocation = self.identity()
        order = self.old.get_model("orders", "Order").objects.create(
            customer=user, amount="10.00", payment_method="RAZORPAY", payment_status="PAID",
        )
        for card_type in types:
            self.old.get_model("orders", "OrderItem").objects.create(
                order=order, product_id=f"historical-{card_type}", card_type=card_type,
                name="Historical product", color="Black", qty=1, price="10.00",
            )
        profile = self.old.get_model("profiles", "Profile").objects.create(user=user, username=f"historical-{user.pk}")
        card = None
        if assigned_type:
            card = self.old.get_model("nfc_cards", "NfcCard").objects.create(
                user=user, card_type=assigned_type, status="ASSIGNED",
                uid=f"historical-{user.pk}", serial_number=f"historical-{user.pk}",
            )
        recipient = self.old.get_model("orders", "OrderRecipient").objects.create(
            order=order, user=user, profile=profile, assigned_card=card,
            email=user.email, name=user.full_name, email_allocation=allocation,
        )
        return recipient, allocation

    def reservation(self, lines, *, explicit_type=None, unknown_session=False):
        user, allocation = self.identity()
        session_id = uuid4()
        if not unknown_session:
            row = {"email": user.email, "full_name": user.full_name, "phone": "9876543210"}
            if explicit_type:
                row["card_type"] = explicit_type
            session = self.old.get_model("payments", "CheckoutSession").objects.create(
                email="buyer@example.com", full_name="Historical Buyer", phone="9876543210",
                subtotal="10.00", amount="10.00", lines=[{"card_type": value, "qty": 1} for value in lines],
                recipients=[row],
            )
            session_id = session.public_id
        self.old.get_model("orders", "RecipientEmailReservation").objects.create(
            allocation=allocation, checkout_session_id=session_id,
        )
        return allocation

    def snapshot(self, apps, field_names=None):
        models = [("accounts", "User"), ("profiles", "Profile"), ("nfc_cards", "NfcCard"),
                  ("orders", "Order"), ("orders", "OrderItem"), ("orders", "OrderRecipient"),
                  ("orders", "RecipientEmailAllocation"), ("orders", "RecipientEmailReservation"),
                  ("payments", "CheckoutSession")]
        fields, snapshots = {}, {}
        for key in models:
            model = apps.get_model(*key)
            fields[key] = field_names[key] if field_names else [field.attname for field in model._meta.concrete_fields]
            snapshots[key] = list(model.objects.order_by("pk").values(*fields[key]))
        return fields, snapshots

    def test_backfill_preserves_history_and_only_labels_unambiguous_products(self):
        digital, digital_claim = self.recipient(["CUSTOM"])
        wooden, wooden_claim = self.recipient(["WOODEN"])
        review, review_claim = self.recipient(["REVIEW"])
        assigned, assigned_claim = self.recipient(["CUSTOM", "REVIEW"], assigned_type="CUSTOM")
        ambiguous, ambiguous_claim = self.recipient(["CUSTOM", "REVIEW"])
        invalid, invalid_claim = self.recipient(["UNKNOWN"])
        mismatched, mismatched_claim = self.recipient(["REVIEW"], assigned_type="CUSTOM")
        _, empty_claim = self.identity()
        fields, before = self.snapshot(self.old)
        current = self.forward()
        _, after = self.snapshot(current, fields)
        self.assertEqual(after, before, "Existing record fields and IDs must remain unchanged")
        Recipient = current.get_model("orders", "OrderRecipient")
        Allocation = current.get_model("orders", "RecipientEmailAllocation")
        for row, expected in ((digital, "CUSTOM"), (wooden, "WOODEN"), (review, "REVIEW"),
                              (assigned, "CUSTOM"), (ambiguous, ""), (invalid, ""), (mismatched, "REVIEW")):
            self.assertEqual(Recipient.objects.get(pk=row.pk).card_type, expected)
        for row, expected in ((digital_claim, "CUSTOM"), (wooden_claim, "CUSTOM"), (review_claim, "REVIEW"),
                              (assigned_claim, "CUSTOM"), (ambiguous_claim, ""), (invalid_claim, ""), (empty_claim, ""), (mismatched_claim, "REVIEW")):
            self.assertEqual(Allocation.objects.get(pk=row.pk).card_type, expected)

    def test_reservations_are_preserved_and_ambiguous_claims_remain_conservative(self):
        digital = self.reservation(["CUSTOM", "WOODEN"])
        review = self.reservation(["REVIEW"])
        explicit = self.reservation(["CUSTOM", "REVIEW"], explicit_type="REVIEW")
        ambiguous = self.reservation(["CUSTOM", "REVIEW"])
        unknown = self.reservation([], unknown_session=True)
        fields, before = self.snapshot(self.old)
        current = self.forward()
        self.assertEqual(self.snapshot(current, fields)[1], before)
        Allocation = current.get_model("orders", "RecipientEmailAllocation")
        for row, expected in ((digital, "CUSTOM"), (review, "REVIEW"), (explicit, "REVIEW"), (ambiguous, ""), (unknown, "")):
            self.assertEqual(Allocation.objects.get(pk=row.pk).card_type, expected)

    def test_reverse_refuses_to_delete_or_merge_dual_product_claims(self):
        _, claim = self.recipient(["CUSTOM"])
        current = self.forward()
        Allocation = current.get_model("orders", "RecipientEmailAllocation")
        Allocation.objects.create(normalized_email=claim.normalized_email, owner_email="buyer@example.com", card_type="REVIEW")
        with self.assertRaisesRegex(RuntimeError, "Cannot restore global email uniqueness"):
            MigrationExecutor(connection).migrate(self.previous)
        self.assertEqual(Allocation.objects.filter(normalized_email=claim.normalized_email).count(), 2)
