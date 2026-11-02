from unittest import mock

from django.core.cache import cache
from rest_framework.test import APITestCase

from accounts.models import User

# Offline stand-in for India Post's PIN directory (see
# customer_management.customer_addresses.pincode) so tests never hit the
# network. Same record shape the real api.postalpincode.in returns.
FAKE_PINCODE_DIRECTORY = {
    "500001": [
        {"Name": "Hyderabad", "District": "Hyderabad", "State": "Telangana", "Block": "Hyderabad", "Division": "Hyderabad GPO"},
        {"Name": "Moazzampura", "District": "Hyderabad", "State": "Telangana", "Block": "Nampally", "Division": "Hyderabad City"},
    ],
    "560001": [
        {"Name": "Bangalore", "District": "Bangalore", "State": "Karnataka", "Block": "Bangalore North", "Division": "Bangalore GPO"},
    ],
    "122001": [
        {"Name": "Gurgaon", "District": "Gurgaon", "State": "Haryana", "Block": "Gurgaon", "Division": "Gurgaon"},
    ],
    # Real record shape: India Post still files Govindaraopet (Mulugu
    # district since 2019) under its pre-reorganisation district, Warangal.
    "506344": [
        {"Name": "Govindaraopet", "District": "Warangal", "State": "Telangana", "Block": "Govindaraopet", "Division": "Hanamkonda"},
        {"Name": "Tadvai", "District": "Warangal", "State": "Telangana", "Block": "Tadvai", "Division": "Hanamkonda"},
    ],
    "500084": [
        {"Name": "Kondapur", "District": "K.V.Rangareddy", "State": "Telangana", "Block": "Serilingampally", "Division": "Cyberabad"},
    ],
}


def fake_india_post_fetch(pincode):
    return FAKE_PINCODE_DIRECTORY.get(pincode, [])


def fake_india_post_name_search(name):
    """India Post's /postoffice/<name> search: offices whose name contains it."""
    return [
        {**office, "Pincode": pincode}
        for pincode, offices in FAKE_PINCODE_DIRECTORY.items()
        for office in offices
        if name.lower() in office["Name"].lower()
    ]


def patch_pincode_directory(test_case):
    """Points PIN lookups at FAKE_PINCODE_DIRECTORY for the rest of the
    test (and clears cached lookups from earlier tests)."""
    cache.clear()
    patcher = mock.patch(
        "customer_management.customer_addresses.pincode._fetch_from_india_post", side_effect=fake_india_post_fetch
    )
    test_case.pincode_fetch = patcher.start()
    test_case.addCleanup(patcher.stop)
    name_patcher = mock.patch(
        "customer_management.customer_addresses.pincode._fetch_post_offices_by_name",
        side_effect=fake_india_post_name_search,
    )
    name_patcher.start()
    test_case.addCleanup(name_patcher.stop)
    test_case.addCleanup(cache.clear)


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
        patch_pincode_directory(self)
