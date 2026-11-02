from django.urls import reverse
from rest_framework import status

from common.test_utils import AuthenticatedAPITestCase

from . import pincode as pincode_service
from .models import CustomerAddress


def _payload(**overrides):
    data = {
        "full_name": "Test Customer",
        "phone": "9876543210",
        "address_line1": "Plot 12, Main Road",
        "city": "Hyderabad",
        "district": "Hyderabad",
        "state": "Telangana",
        "pincode": "500001",
    }
    data.update(overrides)
    return data


def _make_address(user, **overrides):
    return CustomerAddress.objects.create(customer=user, country="India", **_payload(**overrides))


class AddressPincodeValidationTests(AuthenticatedAPITestCase):
    url = reverse("customer-addresses")

    def test_accepts_address_matching_its_pincode(self):
        response = self.client.post(self.url, _payload(), format="json")
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)

    def test_accepts_renamed_city_alias(self):
        response = self.client.post(
            self.url, _payload(city="Bengaluru", district="Bengaluru Urban", state="Karnataka", pincode="560001"),
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)

    def test_rejects_malformed_pincodes(self):
        for bad in ["5000", "50000a", "012345", "5000011"]:
            with self.subTest(pincode=bad):
                response = self.client.post(self.url, _payload(pincode=bad), format="json")
                self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
                self.assertIn("pincode", response.data["errors"])

    def test_rejects_pincode_that_does_not_exist(self):
        response = self.client.post(self.url, _payload(pincode="999999"), format="json")
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(response.data["errors"]["pincode"], [pincode_service.NOT_FOUND_MESSAGE])

    def test_rejects_pincode_from_another_state(self):
        """A Telangana address with a Haryana PIN code is the reported bug."""
        response = self.client.post(self.url, _payload(pincode="122001"), format="json")
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("state", response.data["errors"])
        self.assertIn("Haryana", response.data["message"])
        self.assertFalse(CustomerAddress.objects.exists())

    def test_rejects_city_and_district_that_do_not_match_pincode(self):
        response = self.client.post(
            self.url, _payload(city="Mysuru", district="Mysuru", state="Karnataka", pincode="560001"), format="json"
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("city", response.data["errors"])
        self.assertIn("district", response.data["errors"])

    def test_edit_cannot_introduce_a_mismatched_pincode(self):
        address = _make_address(self.user)
        url = reverse("customer-address-detail", args=[address.pk])
        response = self.client.patch(url, {"pincode": "122001"}, format="json")
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        address.refresh_from_db()
        self.assertEqual(address.pincode, "500001")

    def test_edit_can_correct_a_previously_saved_invalid_address(self):
        address = _make_address(self.user, pincode="122001")  # saved before verification existed
        url = reverse("customer-address-detail", args=[address.pk])
        response = self.client.patch(url, {"pincode": "500001"}, format="json")
        self.assertEqual(response.status_code, status.HTTP_200_OK)

    # --- Legacy-district PINs (India Post lists 506344 under Warangal) ---

    def _mulugu(self, **overrides):
        data = {"locality": "Govindaraopet", "city": "Mulugu", "district": "Mulugu", "state": "Telangana", "pincode": "506344"}
        data.update(overrides)
        return _payload(**data)

    def test_accepts_current_district_when_india_post_lists_the_legacy_one(self):
        response = self.client.post(self.url, self._mulugu(), format="json")
        self.assertEqual(response.status_code, status.HTTP_201_CREATED, response.data)

    def test_rejects_locality_with_a_pincode_that_does_not_serve_it(self):
        response = self.client.post(self.url, self._mulugu(pincode="500001", city="Hyderabad", district="Hyderabad"), format="json")
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("506344", response.data["errors"]["locality"][0])

    def test_rejects_legacy_district_pin_with_wrong_state(self):
        response = self.client.post(self.url, self._mulugu(state="Andhra Pradesh"), format="json")
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("state", response.data["errors"])

    def test_rejects_unrelated_locality_served_by_another_pincode(self):
        response = self.client.post(self.url, self._mulugu(locality="Kondapur"), format="json")
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("500084", response.data["errors"]["locality"][0])

    def test_asks_for_locality_when_city_is_only_a_district_town(self):
        response = self.client.post(self.url, self._mulugu(locality=""), format="json")
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("locality", response.data["errors"])

    def test_unmapped_district_needs_explicit_confirmation(self):
        response = self.client.post(self.url, self._mulugu(district="Adilabad"), format="json")
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn(pincode_service.DISTRICT_CONFIRMATION_KEY, response.data["errors"])

        response = self.client.post(self.url, self._mulugu(district="Adilabad", confirm_district=True), format="json")
        self.assertEqual(response.status_code, status.HTTP_201_CREATED, response.data)
        self.assertNotIn("confirm_district", response.data["data"])

    def test_confirmation_cannot_override_an_unproven_location(self):
        response = self.client.post(
            self.url, self._mulugu(locality="Kondapur", district="Adilabad", confirm_district=True), format="json"
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_fails_closed_when_pin_directory_is_unreachable(self):
        self.pincode_fetch.side_effect = pincode_service.PincodeServiceUnavailable
        response = self.client.post(self.url, _payload(), format="json")
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(response.data["errors"]["pincode"], [pincode_service.UNAVAILABLE_MESSAGE])


class PincodeLookupViewTests(AuthenticatedAPITestCase):
    def test_returns_location_for_existing_pincode(self):
        response = self.client.get(reverse("customer-pincode-lookup", args=["500001"]))
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        data = response.data["data"]
        self.assertEqual(data["state"], "Telangana")
        self.assertEqual(data["districts"], ["Hyderabad"])
        self.assertIn("Moazzampura", data["post_offices"])

    def test_rejects_unknown_and_malformed_pincodes(self):
        for pin in ["999999", "12ab56"]:
            with self.subTest(pincode=pin):
                response = self.client.get(reverse("customer-pincode-lookup", args=[pin]))
                self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_reports_service_outage_as_503(self):
        self.pincode_fetch.side_effect = pincode_service.PincodeServiceUnavailable
        response = self.client.get(reverse("customer-pincode-lookup", args=["500001"]))
        self.assertEqual(response.status_code, status.HTTP_503_SERVICE_UNAVAILABLE)

    def test_caches_lookups(self):
        self.client.get(reverse("customer-pincode-lookup", args=["500001"]))
        self.client.get(reverse("customer-pincode-lookup", args=["500001"]))
        self.assertEqual(self.pincode_fetch.call_count, 1)


class AddressVerifyViewTests(AuthenticatedAPITestCase):
    def test_verified_address(self):
        address = _make_address(self.user)
        response = self.client.post(reverse("customer-address-verify", args=[address.pk]))
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertTrue(response.data["data"]["verified"])

    def test_legacy_district_address_is_verified_with_a_note(self):
        address = _make_address(
            self.user, locality="Govindaraopet", city="Mulugu", district="Mulugu", pincode="506344"
        )
        response = self.client.post(reverse("customer-address-verify", args=[address.pk]))
        data = response.data["data"]
        self.assertTrue(data["verified"], data)
        self.assertEqual(data["matched_place"], "Govindaraopet")
        self.assertIn("Warangal", data["district_note"])

    def test_previously_saved_mismatched_address_is_not_verified(self):
        address = _make_address(self.user, pincode="122001")
        response = self.client.post(reverse("customer-address-verify", args=[address.pk]))
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertFalse(response.data["data"]["verified"])
        self.assertIn("pincode", response.data["data"]["errors"])

    def test_cannot_verify_another_customers_address(self):
        address = _make_address(self.other_user)
        response = self.client.post(reverse("customer-address-verify", args=[address.pk]))
        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)
