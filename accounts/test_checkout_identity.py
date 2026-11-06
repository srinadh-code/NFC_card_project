from django.test import override_settings
from django.urls import reverse
from rest_framework.test import APITestCase

from accounts import onboarding
from accounts.models import User
from accounts.serializers import RegisterSerializer, resolve_login_email
from common.test_utils import make_user
from profiles.models import Profile


@override_settings(PASSWORD_HASHERS=["django.contrib.auth.hashers.MD5PasswordHasher"])
class LegacyCheckoutIdentityTests(APITestCase):
    def setUp(self):
        self.user = make_user(email="legacy@example.com", password="Existing@123", email_verified=True)
        # Simulate historical mixed-case storage without changing its password.
        User.objects.filter(pk=self.user.pk).update(email="Legacy@Example.COM")
        self.user.refresh_from_db()

    def test_mixed_case_account_can_still_log_in_using_normalized_email(self):
        self.assertEqual(resolve_login_email("  LEGACY@example.com  "), self.user.email)
        response = self.client.post(reverse("auth-login"), {"email": "legacy@example.com", "password": "Existing@123"}, format="json")
        self.assertEqual(response.status_code, 200, response.content)
        self.assertEqual(response.data["data"]["user"]["id"], self.user.pk)

    def test_checkout_reuses_legacy_identity_without_changing_password_or_profile(self):
        password = self.user.password
        user, created = onboarding.provision_customer(email=" LEGACY@example.com ", full_name="Different name", phone="1234567890", create_profile=False)
        self.assertFalse(created)
        self.assertEqual(user.pk, self.user.pk)
        user.refresh_from_db()
        self.assertEqual(user.password, password)
        self.assertFalse(Profile.objects.filter(user=user).exists())
        self.assertEqual(User.objects.filter(email__iexact="legacy@example.com").count(), 1)

    def test_registration_cannot_duplicate_legacy_email_case(self):
        serializer = RegisterSerializer(data={"email": "legacy@example.com", "full_name": "Someone", "password": "Existing@123"})
        self.assertFalse(serializer.is_valid())
        self.assertIn("email", serializer.errors)
