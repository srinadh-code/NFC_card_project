from unittest import mock

from django.urls import reverse
from rest_framework import status

from common.test_utils import AuthenticatedAPITestCase

from . import geocoding
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


def _nominatim(address, **extra):
    """Nominatim jsonv2 reverse result (real shape, trimmed)."""
    return {"display_name": ", ".join(address.values()), "category": "highway", "address": address, **extra}


class AddressCoordinatesTests(AuthenticatedAPITestCase):
    """Map-picked pins are saved on the same address model/API; typed
    addresses keep working without them."""

    url = reverse("customer-addresses")

    def test_saves_coordinates_from_map(self):
        response = self.client.post(self.url, _payload(latitude=17.3850441, longitude=78.4866711), format="json")
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(response.data["data"]["latitude"], 17.385044)
        self.assertEqual(response.data["data"]["longitude"], 78.486671)
        address = CustomerAddress.objects.get()
        self.assertEqual(str(address.latitude), "17.385044")

    def test_manual_address_needs_no_coordinates(self):
        response = self.client.post(self.url, _payload(), format="json")
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertIsNone(response.data["data"]["latitude"])
        self.assertIsNone(response.data["data"]["longitude"])

    def test_rejects_half_a_pin(self):
        response = self.client.post(self.url, _payload(latitude=17.38), format="json")
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("latitude", response.data["errors"])

    def test_rejects_pin_outside_india(self):
        response = self.client.post(self.url, _payload(latitude=51.5072, longitude=-0.1276), format="json")
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(response.data["errors"]["latitude"], [geocoding.OUTSIDE_INDIA_MESSAGE])

    def test_pin_verification_still_applies_to_map_addresses(self):
        response = self.client.post(
            self.url, _payload(pincode="122001", latitude=17.385, longitude=78.4867), format="json"
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("state", response.data["errors"])

    def test_edit_keeps_or_clears_coordinates(self):
        address = _make_address(self.user, latitude=17.385, longitude=78.4867)
        url = reverse("customer-address-detail", args=[address.pk])
        response = self.client.patch(url, {"phone": "9123456780"}, format="json")
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["data"]["latitude"], 17.385)
        response = self.client.patch(url, {"latitude": None, "longitude": None}, format="json")
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        address.refresh_from_db()
        self.assertIsNone(address.latitude)
        self.assertIsNone(address.longitude)


class GeocodeReverseViewTests(AuthenticatedAPITestCase):
    url = reverse("customer-geocode-reverse")

    def _reverse(self, nominatim_result, lat=17.385, lng=78.4867):
        with mock.patch.object(geocoding, "_fetch_reverse", return_value=nominatim_result) as fetch:
            response = self.client.get(self.url, {"lat": lat, "lng": lng})
        return response, fetch

    def test_maps_osm_address_onto_form_fields(self):
        response, _ = self._reverse(
            _nominatim(
                {
                    "house_number": "12",
                    "road": "Abids Road",
                    "suburb": "Moazzampura",
                    "city": "Hyderabad",
                    "state_district": "Hyderabad District",
                    "state": "Telangana",
                    "postcode": "500001",
                    "country": "India",
                    "country_code": "in",
                }
            )
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        data = response.data["data"]
        self.assertEqual(data["address_line1"], "12, Abids Road")
        self.assertEqual(data["locality"], "Moazzampura")
        self.assertEqual(data["city"], "Hyderabad")
        self.assertEqual(data["district"], "Hyderabad")
        self.assertEqual(data["state"], "Telangana")
        self.assertEqual(data["pincode"], "500001")
        self.assertEqual(data["country"], "India")
        self.assertEqual((data["latitude"], data["longitude"]), (17.385, 78.4867))

    def test_named_place_becomes_landmark(self):
        response, _ = self._reverse(
            _nominatim(
                {"road": "Abids Road", "city": "Hyderabad", "state": "Telangana", "postcode": "500001", "country_code": "in"},
                category="amenity",
                name="City Hospital",
            )
        )
        self.assertEqual(response.data["data"]["landmark"], "City Hospital")

    def test_rural_pin_without_postcode_gets_pin_from_india_post(self):
        """No OSM postcode: the village is India Post's Govindaraopet post
        office, which has exactly one PIN in Telangana."""
        response, _ = self._reverse(
            _nominatim(
                {"village": "Govindaraopet", "state_district": "Mulugu", "state": "Telangana", "country_code": "in"}
            ),
            lat=18.1977,
            lng=80.1298,
        )
        data = response.data["data"]
        self.assertEqual(data["city"], "Govindaraopet")
        self.assertEqual(data["district"], "Mulugu")
        self.assertEqual(data["pincode"], "506344")

    def test_osm_suburb_named_like_another_pins_post_office_moves_to_line2(self):
        response, _ = self._reverse(
            _nominatim(
                {
                    "road": "Station Road",
                    "suburb": "Govindaraopet",
                    "city": "Hyderabad",
                    "state_district": "Hyderabad",
                    "state": "Telangana",
                    "postcode": "500001",
                    "country_code": "in",
                }
            )
        )
        data = response.data["data"]
        self.assertEqual(data["locality"], "")
        self.assertEqual(data["address_line2"], "Govindaraopet")
        self.assertEqual(data["pincode"], "500001")

    def test_drops_postcode_that_is_not_a_real_pin(self):
        response, _ = self._reverse(
            _nominatim(
                {"road": "Ring Road", "city": "Kukatpally", "state": "Telangana", "postcode": "123456", "country_code": "in"}
            )
        )
        self.assertEqual(response.data["data"]["pincode"], "")

    def test_replaces_unreal_postcode_with_the_cities_post_office_pin(self):
        response, _ = self._reverse(
            _nominatim(
                {"road": "Ring Road", "city": "Hyderabad", "state": "Telangana", "postcode": "123456", "country_code": "in"}
            )
        )
        self.assertEqual(response.data["data"]["pincode"], "500001")

    def test_rejects_location_outside_india(self):
        response, _ = self._reverse(_nominatim({"city": "Kathmandu", "country_code": "np"}), lat=27.7172, lng=85.324)
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(response.data["message"], geocoding.OUTSIDE_INDIA_MESSAGE)

    def test_rejects_point_outside_service_area_without_calling_service(self):
        response, fetch = self._reverse({}, lat=51.5, lng=-0.12)
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        fetch.assert_not_called()

    def test_rejects_missing_or_invalid_coordinates(self):
        for params in [{}, {"lat": "abc", "lng": "78"}, {"lat": "95", "lng": "78"}]:
            with self.subTest(params=params):
                response = self.client.get(self.url, params)
                self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_nothing_at_that_spot(self):
        response, _ = self._reverse({"error": "Unable to geocode"})
        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)

    def test_service_unavailable(self):
        with mock.patch.object(geocoding, "_fetch_reverse", side_effect=geocoding.GeocodingUnavailable):
            response = self.client.get(self.url, {"lat": 17.385, "lng": 78.4867})
        self.assertEqual(response.status_code, status.HTTP_503_SERVICE_UNAVAILABLE)

    def test_requires_customer_login(self):
        self.client.force_authenticate(user=None)
        response = self.client.get(self.url, {"lat": 17.385, "lng": 78.4867})
        self.assertIn(response.status_code, (status.HTTP_401_UNAUTHORIZED, status.HTTP_403_FORBIDDEN))


def _photon_feature(lng, lat, **props):
    return {"properties": props, "geometry": {"coordinates": [lng, lat]}}


class GeocodeSearchViewTests(AuthenticatedAPITestCase):
    url = reverse("customer-geocode-search")

    CHARMINAR = {
        "name": "Charminar",
        "street": "Charminar Road",
        "city": "Hyderabad",
        "state": "Telangana",
        "postcode": "500002",
        "countrycode": "IN",
    }
    FEATURES = [
        _photon_feature(78.4747, 17.3616, **CHARMINAR),
        _photon_feature(78.4748, 17.3617, **CHARMINAR),  # duplicate — shown once
        _photon_feature(55.27, 25.2, name="Charminar Restaurant", city="Dubai", countrycode="AE"),  # outside India
    ]

    def test_returns_places_in_india(self):
        with mock.patch.object(geocoding, "_fetch_search", return_value=self.FEATURES):
            response = self.client.get(self.url, {"q": "Charminar"})
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(
            response.data["data"],
            [
                {
                    "title": "Charminar",
                    "subtitle": "Charminar Road, Hyderabad, Telangana, 500002",
                    "latitude": 17.3616,
                    "longitude": 78.4747,
                }
            ],
        )

    def test_short_query_returns_nothing_without_calling_service(self):
        with mock.patch.object(geocoding, "_fetch_search") as fetch:
            response = self.client.get(self.url, {"q": "ch"})
        self.assertEqual(response.data["data"], [])
        fetch.assert_not_called()

    def test_service_unavailable(self):
        with mock.patch.object(geocoding, "_fetch_search", side_effect=geocoding.GeocodingUnavailable):
            response = self.client.get(self.url, {"q": "Charminar"})
        self.assertEqual(response.status_code, status.HTTP_503_SERVICE_UNAVAILABLE)
