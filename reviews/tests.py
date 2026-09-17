from django.urls import reverse
from rest_framework import status
from rest_framework.test import APITestCase

from common.test_utils import make_user
from orders.models import Order

from .models import Review


def make_paid_order(user, **overrides):
    """A minimal, real Order row with payment_status=PAID — the same bar
    orders/services.py::resolve_customer_plan already uses for "has this
    customer actually bought something", reused here as review eligibility."""
    payload = dict(
        customer=user,
        amount="499.00",
        shipping="49.00",
        payment_method=Order.PaymentMethod.UPI,
        payment_status=Order.PaymentStatus.PAID,
        shipping_line1="123 Main St",
        shipping_city="Hyderabad",
        shipping_state="Telangana",
        shipping_pincode="500001",
    )
    payload.update(overrides)
    return Order.objects.create(**payload)


class CustomerReviewCreateTests(APITestCase):
    def setUp(self):
        self.user = make_user(email="reviewer@example.com")

    def _payload(self, **overrides):
        payload = {"rating": 5, "review_text": "Very useful digital card and easy to share."}
        payload.update(overrides)
        return payload

    def test_anonymous_cannot_submit_review(self):
        response = self.client.post(reverse("review-me"), self._payload(), format="json")
        self.assertIn(response.status_code, (status.HTTP_401_UNAUTHORIZED, status.HTTP_403_FORBIDDEN))
        self.assertEqual(Review.objects.count(), 0)

    def test_user_without_eligible_order_is_rejected(self):
        self.client.force_authenticate(user=self.user)
        response = self.client.post(reverse("review-me"), self._payload(), format="json")
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)
        self.assertEqual(Review.objects.count(), 0)

    def test_user_with_eligible_order_can_submit_review(self):
        make_paid_order(self.user)
        self.client.force_authenticate(user=self.user)
        response = self.client.post(reverse("review-me"), self._payload(), format="json")
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(Review.objects.count(), 1)
        review = Review.objects.get(user=self.user)
        self.assertEqual(review.rating, 5)
        self.assertFalse(review.is_published)  # unpublished until an admin moderates it

    def test_second_review_by_same_customer_is_rejected(self):
        make_paid_order(self.user)
        self.client.force_authenticate(user=self.user)
        self.client.post(reverse("review-me"), self._payload(), format="json")

        response = self.client.post(reverse("review-me"), self._payload(review_text="A second attempt."), format="json")
        self.assertEqual(response.status_code, status.HTTP_409_CONFLICT)
        self.assertEqual(Review.objects.count(), 1)

    def test_database_constraint_blocks_a_second_row_even_bypassing_the_view(self):
        """The view-level check above is a nicety — this is the real
        guarantee. Two Review rows for the same user must be impossible at
        the database layer, not just discouraged by application code."""
        from django.db import IntegrityError, transaction

        Review.objects.create(user=self.user, rating=5, review_text="First review here.")
        with self.assertRaises(IntegrityError):
            with transaction.atomic():
                Review.objects.create(user=self.user, rating=4, review_text="Second review here.")
        self.assertEqual(Review.objects.filter(user=self.user).count(), 1)

    def test_invalid_rating_is_rejected(self):
        make_paid_order(self.user)
        self.client.force_authenticate(user=self.user)
        response = self.client.post(reverse("review-me"), self._payload(rating=6), format="json")
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(Review.objects.count(), 0)

    def test_empty_review_text_is_rejected(self):
        make_paid_order(self.user)
        self.client.force_authenticate(user=self.user)
        response = self.client.post(reverse("review-me"), self._payload(review_text=""), format="json")
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_too_short_review_text_is_rejected(self):
        make_paid_order(self.user)
        self.client.force_authenticate(user=self.user)
        response = self.client.post(reverse("review-me"), self._payload(review_text="short"), format="json")
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_review_text_over_500_characters_is_rejected(self):
        make_paid_order(self.user)
        self.client.force_authenticate(user=self.user)
        response = self.client.post(reverse("review-me"), self._payload(review_text="x" * 501), format="json")
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)


class CustomerReviewGetUpdateTests(APITestCase):
    def setUp(self):
        self.user = make_user(email="reviewer@example.com")
        self.other_user = make_user(email="other@example.com")
        make_paid_order(self.user)
        make_paid_order(self.other_user)

    def test_get_with_no_review_returns_has_review_false(self):
        self.client.force_authenticate(user=self.user)
        response = self.client.get(reverse("review-me"))
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["data"], {"has_review": False})

    def test_customer_can_update_own_review(self):
        self.client.force_authenticate(user=self.user)
        self.client.post(
            reverse("review-me"), {"rating": 5, "review_text": "Very useful digital card."}, format="json"
        )

        response = self.client.patch(
            reverse("review-me"),
            {"rating": 4, "review_text": "Updated: still very useful."},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(Review.objects.count(), 1)
        review = Review.objects.get(user=self.user)
        self.assertEqual(review.rating, 4)
        self.assertEqual(review.review_text, "Updated: still very useful.")

    def test_editing_never_touches_another_customers_review(self):
        """There is no review id/user id accepted from the client — PATCH
        always resolves to request.user's own row. This proves Customer B
        editing their own review can never affect Customer A's."""
        review_a = Review.objects.create(user=self.user, rating=5, review_text="Customer A's original review.")

        self.client.force_authenticate(user=self.other_user)
        self.client.post(
            reverse("review-me"), {"rating": 3, "review_text": "Customer B's own review here."}, format="json"
        )
        self.client.patch(
            reverse("review-me"), {"rating": 1, "review_text": "Customer B changed their mind."}, format="json"
        )

        review_a.refresh_from_db()
        self.assertEqual(review_a.rating, 5)
        self.assertEqual(review_a.review_text, "Customer A's original review.")

    def test_patch_without_existing_review_is_not_found(self):
        self.client.force_authenticate(user=self.user)
        response = self.client.patch(reverse("review-me"), {"rating": 3}, format="json")
        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)

    def test_customer_sees_own_disabled_review(self):
        review = Review.objects.create(user=self.user, rating=5, review_text="A perfectly fine review.")
        review.is_published = False
        review.save(update_fields=["is_published"])

        self.client.force_authenticate(user=self.user)
        response = self.client.get(reverse("review-me"))
        self.assertTrue(response.data["data"]["has_review"])
        self.assertFalse(response.data["data"]["review"]["is_published"])

    def test_editing_a_disabled_review_does_not_republish_it(self):
        review = Review.objects.create(
            user=self.user, rating=5, review_text="A perfectly fine review.", is_published=True
        )
        review.is_published = False
        review.save(update_fields=["is_published"])

        self.client.force_authenticate(user=self.user)
        response = self.client.patch(
            reverse("review-me"), {"review_text": "An edited, still-fine review."}, format="json"
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        review.refresh_from_db()
        self.assertFalse(review.is_published)

        # Also confirm PATCH can't be used to sneak is_published=True through.
        response = self.client.patch(reverse("review-me"), {"is_published": True}, format="json")
        review.refresh_from_db()
        self.assertFalse(review.is_published)


class PublicReviewsTests(APITestCase):
    def setUp(self):
        self.user_a = make_user(email="a@example.com", full_name="Kavya Achhe")
        self.user_b = make_user(email="b@example.com", full_name="Rahul Kumar")
        self.enabled = Review.objects.create(
            user=self.user_a, rating=5, review_text="Very useful digital card.", is_published=True
        )
        self.disabled = Review.objects.create(
            user=self.user_b, rating=3, review_text="It was good but could improve.", is_published=False
        )

    def test_public_endpoint_works_without_authentication(self):
        response = self.client.get(reverse("review-public"))
        self.assertEqual(response.status_code, status.HTTP_200_OK)

    def test_only_enabled_reviews_are_returned(self):
        response = self.client.get(reverse("review-public"))
        names = [r["customer_name"] for r in response.data["data"]]
        self.assertIn("Kavya Achhe", names)
        self.assertNotIn("Rahul Kumar", names)

    def test_enabling_a_review_makes_it_appear_publicly(self):
        self.disabled.is_published = True
        self.disabled.save(update_fields=["is_published"])
        response = self.client.get(reverse("review-public"))
        names = [r["customer_name"] for r in response.data["data"]]
        self.assertIn("Rahul Kumar", names)

    def test_public_serializer_never_exposes_email(self):
        response = self.client.get(reverse("review-public"))
        self.assertNotIn("customer_email", response.data["data"][0])
        self.assertNotIn("email", str(response.data["data"]))


class AdminReviewTests(APITestCase):
    def setUp(self):
        self.admin = make_user(email="admin@example.com", role="ADMIN")
        self.customer = make_user(email="customer@example.com")
        self.review = Review.objects.create(
            user=self.customer, rating=5, review_text="Very useful digital card.", is_published=True
        )

    def test_normal_customer_cannot_access_admin_review_list(self):
        self.client.force_authenticate(user=self.customer)
        response = self.client.get(reverse("admin-reviews"))
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_admin_lists_all_reviews_enabled_and_disabled(self):
        Review.objects.create(
            user=make_user(email="other2@example.com"), rating=2, review_text="Not great honestly.", is_published=False
        )
        self.client.force_authenticate(user=self.admin)
        response = self.client.get(reverse("admin-reviews"))
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["pagination"]["count"], 2)

    def test_admin_can_disable_a_review_without_deleting_it(self):
        self.client.force_authenticate(user=self.admin)
        response = self.client.patch(
            reverse("admin-review-detail", args=[self.review.pk]), {"is_published": False}, format="json"
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.review.refresh_from_db()
        self.assertFalse(self.review.is_published)
        self.assertTrue(Review.objects.filter(pk=self.review.pk).exists())

    def test_admin_can_enable_a_review(self):
        self.review.is_published = False
        self.review.save(update_fields=["is_published"])
        self.client.force_authenticate(user=self.admin)
        response = self.client.patch(
            reverse("admin-review-detail", args=[self.review.pk]), {"is_published": True}, format="json"
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.review.refresh_from_db()
        self.assertTrue(self.review.is_published)

    def test_admin_search_by_customer_name(self):
        self.client.force_authenticate(user=self.admin)
        response = self.client.get(reverse("admin-reviews"), {"search": self.customer.full_name})
        self.assertEqual(response.data["pagination"]["count"], 1)

    def test_admin_filter_by_status(self):
        Review.objects.create(
            user=make_user(email="other3@example.com"), rating=1, review_text="Did not like it much.", is_published=False
        )
        self.client.force_authenticate(user=self.admin)
        response = self.client.get(reverse("admin-reviews"), {"status": "disabled"})
        self.assertEqual(response.data["pagination"]["count"], 1)
