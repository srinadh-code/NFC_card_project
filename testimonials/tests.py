from unittest.mock import patch

from django.core.cache import cache
from django.core.files.uploadedfile import SimpleUploadedFile
from django.db import IntegrityError, transaction
from django.urls import reverse
from rest_framework import status
from rest_framework.test import APITestCase

from common.test_utils import make_user
from orders.models import Order

from .models import Testimonial
from .services import NOT_ELIGIBLE_MESSAGE

Status = Testimonial.Status
VALID_REVIEW = "The NFC card made networking at events effortless for our team."


def make_order(user, payment_status=Order.PaymentStatus.PAID, **overrides):
    payload = dict(
        customer=user,
        amount="499.00",
        shipping="49.00",
        payment_method=Order.PaymentMethod.UPI,
        payment_status=payment_status,
        shipping_line1="123 Main St",
        shipping_city="Hyderabad",
        shipping_state="Telangana",
        shipping_pincode="500001",
    )
    payload.update(overrides)
    return Order.objects.create(**payload)


def make_testimonial(user, **overrides):
    payload = dict(customer=user, name="Test Customer", rating=5, review=VALID_REVIEW)
    payload.update(overrides)
    return Testimonial.objects.create(**payload)


def fake_image(name="photo.png", content_type="image/png"):
    return SimpleUploadedFile(name, b"\x89PNG\r\n\x1a\nfake", content_type=content_type)


class _Base(APITestCase):
    def setUp(self):
        cache.clear()  # ScopedRateThrottle state lives in the cache
        self.user = make_user(email="buyer@example.com", full_name="Asha Buyer")
        self.other = make_user(email="other@example.com", full_name="Other Buyer")
        self.admin = make_user(email="admin@example.com", role="ADMIN")

    def _payload(self, **overrides):
        payload = {"name": "Asha Buyer", "designation": "Founder", "company": "Acme", "rating": 5, "review": VALID_REVIEW}
        payload.update(overrides)
        return payload


class CreateTestimonialTests(_Base):
    def test_guest_cannot_create(self):
        response = self.client.post(reverse("testimonial-create"), self._payload(), format="json")
        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)
        self.assertEqual(Testimonial.objects.count(), 0)

    def test_customer_without_paid_order_is_rejected_with_spec_message(self):
        make_order(self.user, payment_status=Order.PaymentStatus.PENDING)
        self.client.force_authenticate(self.user)
        response = self.client.post(reverse("testimonial-create"), self._payload(), format="json")
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)
        self.assertEqual(response.data["message"], NOT_ELIGIBLE_MESSAGE)
        self.assertEqual(Testimonial.objects.count(), 0)

    def test_existing_customer_with_paid_order_can_create_and_starts_pending(self):
        order = make_order(self.user)
        self.client.force_authenticate(self.user)
        response = self.client.post(reverse("testimonial-create"), self._payload(), format="json")
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        t = Testimonial.objects.get()
        self.assertEqual(t.customer, self.user)
        self.assertEqual(t.order, order)  # defaults to latest paid order
        self.assertEqual(t.status, Status.PENDING)

    def test_client_cannot_set_status_or_is_active(self):
        make_order(self.user)
        self.client.force_authenticate(self.user)
        self.client.post(
            reverse("testimonial-create"),
            self._payload(status="APPROVED", is_active=False),
            format="json",
        )
        t = Testimonial.objects.get()
        self.assertEqual(t.status, Status.PENDING)
        self.assertTrue(t.is_active)

    def test_cannot_link_another_customers_order(self):
        make_order(self.user)
        foreign = make_order(self.other)
        self.client.force_authenticate(self.user)
        response = self.client.post(reverse("testimonial-create"), self._payload(order=foreign.pk), format="json")
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("order", response.data["errors"])

    def test_rating_bounds(self):
        make_order(self.user)
        self.client.force_authenticate(self.user)
        for rating in (0, 6):
            response = self.client.post(reverse("testimonial-create"), self._payload(rating=rating), format="json")
            self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
            self.assertIn("rating", response.data["errors"])

    def test_review_minimum_20_characters(self):
        make_order(self.user)
        self.client.force_authenticate(self.user)
        response = self.client.post(reverse("testimonial-create"), self._payload(review="Too short review"), format="json")
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("review", response.data["errors"])

    def test_only_one_pending_testimonial_at_a_time(self):
        make_order(self.user)
        self.client.force_authenticate(self.user)
        self.client.post(reverse("testimonial-create"), self._payload(), format="json")
        response = self.client.post(reverse("testimonial-create"), self._payload(), format="json")
        self.assertEqual(response.status_code, status.HTTP_409_CONFLICT)
        self.assertEqual(Testimonial.objects.count(), 1)

    def test_database_enforces_one_pending_per_customer(self):
        make_testimonial(self.user)
        with self.assertRaises(IntegrityError), transaction.atomic():
            make_testimonial(self.user)

    def test_can_submit_again_after_approval(self):
        make_order(self.user)
        make_testimonial(self.user, status=Status.APPROVED)
        self.client.force_authenticate(self.user)
        response = self.client.post(reverse("testimonial-create"), self._payload(), format="json")
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)

    @patch("testimonials.services.upload_image", return_value={"url": "https://res.cloudinary.com/x.png", "public_id": "testimonials/x"})
    def test_multipart_create_uploads_image(self, upload):
        make_order(self.user)
        self.client.force_authenticate(self.user)
        response = self.client.post(
            reverse("testimonial-create"), {**self._payload(), "profile_image": fake_image()}, format="multipart"
        )
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        t = Testimonial.objects.get()
        self.assertEqual(t.profile_image, "https://res.cloudinary.com/x.png")
        self.assertEqual(t.profile_image_public_id, "testimonials/x")
        upload.assert_called_once()

    @patch("testimonials.services.upload_image")
    def test_svg_upload_is_rejected_before_cloudinary(self, upload):
        make_order(self.user)
        self.client.force_authenticate(self.user)
        response = self.client.post(
            reverse("testimonial-create"),
            {**self._payload(), "profile_image": fake_image("x.svg", "image/svg+xml")},
            format="multipart",
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("profile_image", response.data["errors"])
        upload.assert_not_called()
        self.assertEqual(Testimonial.objects.count(), 0)

    @patch("testimonials.services.upload_image")
    def test_invalid_payload_never_uploads(self, upload):
        make_order(self.user)
        self.client.force_authenticate(self.user)
        self.client.post(
            reverse("testimonial-create"), {**self._payload(rating=9), "profile_image": fake_image()}, format="multipart"
        )
        upload.assert_not_called()


class CustomerUpdateDeleteTests(_Base):
    def setUp(self):
        super().setUp()
        make_order(self.user)
        self.client.force_authenticate(self.user)

    def test_edit_pending(self):
        t = make_testimonial(self.user)
        response = self.client.patch(reverse("testimonial-update", args=[t.pk]), {"rating": 4}, format="json")
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        t.refresh_from_db()
        self.assertEqual(t.rating, 4)
        self.assertEqual(t.status, Status.PENDING)

    def test_put_requires_full_payload(self):
        t = make_testimonial(self.user)
        response = self.client.put(reverse("testimonial-update", args=[t.pk]), {"rating": 4}, format="json")
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        response = self.client.put(reverse("testimonial-update", args=[t.pk]), self._payload(rating=3), format="json")
        self.assertEqual(response.status_code, status.HTTP_200_OK)

    def test_cannot_edit_or_delete_approved_or_rejected(self):
        for s in (Status.APPROVED, Status.REJECTED):
            t = make_testimonial(self.user, status=s)
            response = self.client.patch(reverse("testimonial-update", args=[t.pk]), {"rating": 1}, format="json")
            self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)
            response = self.client.delete(reverse("testimonial-delete", args=[t.pk]))
            self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)
            self.assertTrue(Testimonial.objects.filter(pk=t.pk).exists())

    def test_editable_again_after_admin_moves_back_to_pending(self):
        t = make_testimonial(self.user, status=Status.APPROVED)
        self.client.force_authenticate(self.admin)
        self.client.patch(reverse("admin-testimonial-pending", args=[t.pk]))
        self.client.force_authenticate(self.user)
        response = self.client.patch(reverse("testimonial-update", args=[t.pk]), {"rating": 2}, format="json")
        self.assertEqual(response.status_code, status.HTTP_200_OK)

    def test_cannot_touch_another_customers_testimonial(self):
        t = make_testimonial(self.other)
        response = self.client.patch(reverse("testimonial-update", args=[t.pk]), {"rating": 1}, format="json")
        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)
        response = self.client.delete(reverse("testimonial-delete", args=[t.pk]))
        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)
        t.refresh_from_db()
        self.assertEqual(t.rating, 5)

    def test_delete_pending_cleans_up_image(self):
        t = make_testimonial(self.user, profile_image="https://x", profile_image_public_id="testimonials/old")
        with patch("testimonials.signals.delete_image") as delete_image, self.captureOnCommitCallbacks(execute=True):
            response = self.client.delete(reverse("testimonial-delete", args=[t.pk]))
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertFalse(Testimonial.objects.filter(pk=t.pk).exists())
        delete_image.assert_called_once_with("testimonials/old")

    @patch("testimonials.services.upload_image", return_value={"url": "https://new", "public_id": "testimonials/new"})
    def test_replacing_image_deletes_old_asset(self, _upload):
        t = make_testimonial(self.user, profile_image="https://old", profile_image_public_id="testimonials/old")
        with patch("testimonials.views.delete_image") as delete_image, self.captureOnCommitCallbacks(execute=True):
            response = self.client.patch(
                reverse("testimonial-update", args=[t.pk]), {"profile_image": fake_image()}, format="multipart"
            )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        t.refresh_from_db()
        self.assertEqual(t.profile_image_public_id, "testimonials/new")
        delete_image.assert_called_once_with("testimonials/old")

    def test_remove_image(self):
        t = make_testimonial(self.user, profile_image="https://old", profile_image_public_id="testimonials/old")
        with patch("testimonials.views.delete_image") as delete_image, self.captureOnCommitCallbacks(execute=True):
            self.client.patch(
                reverse("testimonial-update", args=[t.pk]), {"remove_profile_image": "true"}, format="multipart"
            )
        t.refresh_from_db()
        self.assertEqual(t.profile_image, "")
        delete_image.assert_called_once_with("testimonials/old")

    def test_my_list_only_returns_own(self):
        make_testimonial(self.user)
        make_testimonial(self.other)
        response = self.client.get(reverse("testimonial-my-list"))
        self.assertEqual(len(response.data["data"]), 1)
        self.assertTrue(response.data["data"][0]["can_edit"])

    def test_eligibility(self):
        response = self.client.get(reverse("testimonial-eligibility"))
        self.assertTrue(response.data["data"]["can_submit"])
        self.client.force_authenticate(self.other)
        response = self.client.get(reverse("testimonial-eligibility"))
        self.assertFalse(response.data["data"]["eligible"])
        self.assertEqual(response.data["data"]["message"], NOT_ELIGIBLE_MESSAGE)


class PublicTestimonialTests(_Base):
    def test_only_approved_and_active_newest_first(self):
        old = make_testimonial(self.user, status=Status.APPROVED, name="Old")
        make_testimonial(self.user, status=Status.APPROVED, is_active=False, name="Hidden")
        make_testimonial(self.user, status=Status.REJECTED, name="Rejected")
        make_testimonial(self.other, status=Status.PENDING, name="Pending")
        new = make_testimonial(self.other, status=Status.APPROVED, name="New")

        response = self.client.get(reverse("testimonial-public-list"))
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual([t["id"] for t in response.data["data"]], [new.pk, old.pk])

    def test_public_payload_has_no_private_fields(self):
        make_testimonial(self.user, status=Status.APPROVED)
        row = self.client.get(reverse("testimonial-public-list")).data["data"][0]
        for private in ("customer", "customer_email", "order", "status", "is_active", "profile_image_public_id"):
            self.assertNotIn(private, row)

    def test_limit(self):
        make_testimonial(self.user, status=Status.APPROVED)
        make_testimonial(self.other, status=Status.APPROVED)
        response = self.client.get(reverse("testimonial-public-list"), {"limit": 1})
        self.assertEqual(len(response.data["data"]), 1)


class AdminTestimonialTests(_Base):
    def setUp(self):
        super().setUp()
        self.t = make_testimonial(self.user)

    def test_customer_cannot_use_admin_endpoints(self):
        self.client.force_authenticate(self.user)
        for name in ("admin-testimonial-approve", "admin-testimonial-reject", "admin-testimonial-toggle-active"):
            response = self.client.patch(reverse(name, args=[self.t.pk]))
            self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)
        self.assertEqual(self.client.get(reverse("admin-testimonials")).status_code, status.HTTP_403_FORBIDDEN)
        self.t.refresh_from_db()
        self.assertEqual(self.t.status, Status.PENDING)

    def test_approve_reject_toggle(self):
        self.client.force_authenticate(self.admin)
        self.client.patch(reverse("admin-testimonial-approve", args=[self.t.pk]))
        self.t.refresh_from_db()
        self.assertEqual(self.t.status, Status.APPROVED)

        self.client.patch(reverse("admin-testimonial-toggle-active", args=[self.t.pk]))
        self.t.refresh_from_db()
        self.assertFalse(self.t.is_active)

        self.client.patch(reverse("admin-testimonial-reject", args=[self.t.pk]))
        self.t.refresh_from_db()
        self.assertEqual(self.t.status, Status.REJECTED)

    def test_back_to_pending_conflicts_when_another_is_pending(self):
        approved = make_testimonial(self.user, status=Status.APPROVED)
        self.client.force_authenticate(self.admin)
        response = self.client.patch(reverse("admin-testimonial-pending", args=[approved.pk]))
        self.assertEqual(response.status_code, status.HTTP_409_CONFLICT)

    def test_list_search_filter_and_stats(self):
        make_testimonial(self.other, status=Status.APPROVED)
        make_testimonial(self.other, status=Status.REJECTED)
        self.client.force_authenticate(self.admin)

        response = self.client.get(reverse("admin-testimonials"))
        self.assertEqual(response.data["pagination"]["count"], 3)

        response = self.client.get(reverse("admin-testimonials"), {"search": "Other Buyer"})
        self.assertEqual(response.data["pagination"]["count"], 2)

        response = self.client.get(reverse("admin-testimonials"), {"status": "pending"})
        self.assertEqual(response.data["pagination"]["count"], 1)

        response = self.client.get(reverse("admin-testimonials"), {"status": "bogus"})
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

        stats = self.client.get(reverse("admin-testimonial-stats")).data["data"]
        self.assertEqual(stats, {"total": 3, "pending": 1, "approved": 1, "rejected": 1, "live": 1})
