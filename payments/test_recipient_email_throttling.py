"""Public availability lookups keep an independent, enforced per-IP budget."""
from unittest import mock

from django.core.cache import cache
from django.urls import reverse
from rest_framework.test import APITestCase

from orders.models import RecipientEmailAllocation
from payments.views import CheckoutAnonThrottle, RecipientEmailAvailabilityThrottle


class RecipientEmailAvailabilityThrottleTests(APITestCase):
    def setUp(self):
        cache.clear()
        self.addCleanup(cache.clear)

    def check_email(self, email="recipient@example.com", **extra):
        return self.client.post(
            reverse("recipient-email-availability"), {"email": email}, format="json", **extra,
        )

    def test_multiple_recipient_checks_do_not_use_the_checkout_budget_or_allocate_emails(self):
        # Ten fields, then changed addresses in those fields, exceed the old
        # shared checkout budget. Repeated emails remain read-only lookups.
        for index in range(30):
            response = self.check_email(f"recipient{index % 20}@example.com")
            self.assertEqual(response.status_code, 200, response.content)
            self.assertTrue(response.data["data"]["available"])

        self.assertFalse(RecipientEmailAllocation.objects.exists())
        checkout = self.client.post(reverse("razorpay-checkout"), {}, format="json")
        self.assertEqual(checkout.status_code, 400, checkout.content)

    def test_exhausted_checkout_budget_does_not_block_availability(self):
        throttle = CheckoutAnonThrottle()
        cache.set(
            throttle.cache_format % {"scope": throttle.scope, "ident": "127.0.0.1"},
            [throttle.timer()] * throttle.num_requests,
            throttle.duration,
        )
        checkout = self.client.post(reverse("razorpay-checkout"), {}, format="json")
        self.assertEqual(checkout.status_code, 429, checkout.content)

        response = self.check_email()
        self.assertEqual(response.status_code, 200, response.content)

    def test_availability_limit_counts_once_per_request_is_per_ip_and_allows_retry(self):
        with mock.patch.object(RecipientEmailAvailabilityThrottle, "timer", return_value=1000) as timer:
            for index in range(60):
                response = self.check_email(f"recipient{index}@example.com")
                self.assertEqual(response.status_code, 200, response.content)

            limited = self.check_email()
            self.assertEqual(limited.status_code, 429, limited.content)
            self.assertEqual(limited["Retry-After"], "60")
            # Changing the target email does not bypass the client's limit.
            self.assertEqual(self.check_email("another@example.com").status_code, 429)
            self.assertEqual(self.check_email(REMOTE_ADDR="192.0.2.2").status_code, 200)

            timer.return_value = 1061
            retried = self.check_email()
            self.assertEqual(retried.status_code, 200, retried.content)
