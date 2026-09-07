from rest_framework.test import APITestCase

from accounts.models import User


def make_user(email="customer@example.com", password="StrongPass123", **extra):
    extra.setdefault("full_name", "Test Customer")
    extra.setdefault("is_active", True)
    extra.setdefault("email_verified", True)
    return User.objects.create_user(email=email, password=password, **extra)


class AuthenticatedAPITestCase(APITestCase):
    """
    Base for customer-module tests: creates a user, force-authenticates the
    client as that user (bypassing JWT machinery, which is already covered
    by `accounts`' own tests), and exposes `self.user`/`self.other_user` for
    ownership-isolation assertions.
    """

    def setUp(self):
        super().setUp()
        self.user = make_user(email="customer@example.com")
        self.other_user = make_user(email="other@example.com")
        self.client.force_authenticate(user=self.user)
