import io

from django.core.files.uploadedfile import SimpleUploadedFile
from django.urls import reverse
from PIL import Image
from rest_framework import status
from rest_framework.test import APITestCase

from common.test_utils import AuthenticatedAPITestCase, make_user
from customer_management.customer_analytics.models import AnalyticsEvent
from customer_management.customer_notifications.models import Notification
from customer_management.customer_services.models import CustomerService
from customer_management.customer_settings.models import CustomerSettings

from .models import CustomField, Profile


def _fake_image_file(name="cover.png"):
    buffer = io.BytesIO()
    Image.new("RGB", (10, 10), color="blue").save(buffer, format="PNG")
    buffer.seek(0)
    return SimpleUploadedFile(name, buffer.read(), content_type="image/png")


class PublicProfileViewTests(APITestCase):
    def setUp(self):
        self.user = make_user(email="public@example.com", full_name="Public Person")
        self.profile = Profile.ensure_for_user(self.user)

    def test_returns_404_for_unknown_username(self):
        response = self.client.get(reverse("profile-public", args=["nobody"]))
        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)

    def test_returns_404_for_private_profile(self):
        self.profile.profile_public = False
        self.profile.save(update_fields=["profile_public"])

        response = self.client.get(reverse("profile-public", args=[self.profile.username]))
        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)

    def test_visiting_a_public_profile_records_a_profile_view(self):
        response = self.client.get(reverse("profile-public", args=[self.profile.username]))

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(
            AnalyticsEvent.objects.filter(
                user=self.user, event_type=AnalyticsEvent.EventType.PROFILE_VIEW
            ).count(),
            1,
        )

    def test_visiting_via_qr_also_records_a_qr_scan(self):
        url = reverse("profile-public", args=[self.profile.username]) + "?src=qr"
        response = self.client.get(url)

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(
            AnalyticsEvent.objects.filter(
                user=self.user, event_type=AnalyticsEvent.EventType.QR_SCAN
            ).count(),
            1,
        )

    def test_no_profile_view_notification_by_default(self):
        """notify_profile_views defaults to False on CustomerSettings — this
        is the deliberate, existing "opt-in" default, not something this
        change introduces."""
        self.client.get(reverse("profile-public", args=[self.profile.username]))
        self.assertFalse(
            Notification.objects.filter(user=self.user, type=Notification.Type.PROFILE_VIEW).exists()
        )

    def test_profile_view_notifies_once_customer_opts_in(self):
        settings_obj = CustomerSettings.ensure_for_user(self.user)
        settings_obj.notify_profile_views = True
        settings_obj.save(update_fields=["notify_profile_views"])

        self.client.get(reverse("profile-public", args=[self.profile.username]))

        self.assertTrue(
            Notification.objects.filter(user=self.user, type=Notification.Type.PROFILE_VIEW).exists()
        )
        self.assertEqual(
            AnalyticsEvent.objects.filter(
                user=self.user, event_type=AnalyticsEvent.EventType.PROFILE_VIEW
            ).count(),
            1,
        )

    def test_owner_viewing_their_own_profile_does_not_notify_themselves(self):
        settings_obj = CustomerSettings.ensure_for_user(self.user)
        settings_obj.notify_profile_views = True
        settings_obj.save(update_fields=["notify_profile_views"])

        self.client.force_authenticate(user=self.user)
        self.client.get(reverse("profile-public", args=[self.profile.username]))

        self.assertFalse(
            Notification.objects.filter(user=self.user, type=Notification.Type.PROFILE_VIEW).exists()
        )

    def test_a_different_logged_in_customer_viewing_still_notifies_the_owner(self):
        settings_obj = CustomerSettings.ensure_for_user(self.user)
        settings_obj.notify_profile_views = True
        settings_obj.save(update_fields=["notify_profile_views"])

        viewer = make_user(email="viewer@example.com", full_name="Viewer Person")
        self.client.force_authenticate(user=viewer)
        self.client.get(reverse("profile-public", args=[self.profile.username]))

        self.assertTrue(
            Notification.objects.filter(user=self.user, type=Notification.Type.PROFILE_VIEW).exists()
        )

    def test_email_hidden_unless_owner_opted_in(self):
        self.profile.show_email = False
        self.profile.save(update_fields=["show_email"])

        response = self.client.get(reverse("profile-public", args=[self.profile.username]))

        self.assertIsNone(response.data["data"]["email"])

    def test_field_level_privacy_each_field_gated_independently(self):
        """The core of the upgrade: hiding phone/email must not hide
        address/city/state, and vice versa — five independent switches,
        not one broad flag."""
        self.profile.address = "221B Baker Street"
        self.profile.city = "Hyderabad"
        self.profile.state = "Telangana"
        self.profile.show_address = True
        self.profile.show_city = True
        self.profile.show_state = True
        self.profile.show_phone = False
        self.profile.show_email = False
        self.profile.save()

        response = self.client.get(reverse("profile-public", args=[self.profile.username]))
        data = response.data["data"]

        self.assertEqual(data["address"], "221B Baker Street")
        self.assertEqual(data["city"], "Hyderabad")
        self.assertEqual(data["state"], "Telangana")
        self.assertIsNone(data["phone"])
        self.assertIsNone(data["email"])

    def test_field_level_privacy_inverse_combination(self):
        self.user.phone = "+919876543210"
        self.user.save(update_fields=["phone"])
        self.profile.address = "221B Baker Street"
        self.profile.city = "Hyderabad"
        self.profile.state = "Telangana"
        self.profile.show_address = False
        self.profile.show_city = False
        self.profile.show_state = False
        self.profile.show_phone = True
        self.profile.show_email = True
        self.profile.save()

        response = self.client.get(reverse("profile-public", args=[self.profile.username]))
        data = response.data["data"]

        self.assertIsNone(data["address"])
        self.assertIsNone(data["city"])
        self.assertIsNone(data["state"])
        self.assertEqual(data["phone"], self.user.phone)
        self.assertEqual(data["email"], self.user.email)

    def test_customer_can_update_own_field_level_privacy_settings(self):
        self.client.force_authenticate(user=self.user)
        response = self.client.patch(
            reverse("profile-me"),
            {"show_address": False, "show_city": False, "show_phone": False},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.profile.refresh_from_db()
        self.assertFalse(self.profile.show_address)
        self.assertFalse(self.profile.show_city)
        self.assertFalse(self.profile.show_phone)
        # Untouched fields keep their (default True) value — a PATCH here
        # only changes what was actually sent.
        self.assertTrue(self.profile.show_state)
        self.assertTrue(self.profile.show_email)

    def test_cover_image_and_avatar_are_absolute_urls(self):
        """
        Regression test: the public serializer must build absolute media
        URLs using the request context — returning a bare relative path
        (e.g. "/media/...") breaks the image everywhere the API base host
        differs from the frontend host, which is the reported bug.
        """
        self.profile.avatar = _fake_image_file("avatar.png")
        self.profile.cover_image = _fake_image_file("cover.png")
        self.profile.save()

        response = self.client.get(reverse("profile-public", args=[self.profile.username]))

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        data = response.data["data"]
        self.assertTrue(data["avatar"].startswith("http"))
        self.assertTrue(data["cover_image"].startswith("http"))

    def test_cover_image_is_null_when_not_set(self):
        response = self.client.get(reverse("profile-public", args=[self.profile.username]))
        self.assertIsNone(response.data["data"]["cover_image"])

    def test_city_state_country_are_public(self):
        self.profile.city = "Hyderabad"
        self.profile.state = "Telangana"
        self.profile.country = "India"
        self.profile.save(update_fields=["city", "state", "country"])

        response = self.client.get(reverse("profile-public", args=[self.profile.username]))

        data = response.data["data"]
        self.assertEqual(data["city"], "Hyderabad")
        self.assertEqual(data["state"], "Telangana")
        self.assertEqual(data["country"], "India")

    def test_only_active_services_are_public(self):
        CustomerService.objects.create(user=self.user, title="Web Dev", display_order=0, is_active=True)
        CustomerService.objects.create(user=self.user, title="Hidden", display_order=1, is_active=False)

        response = self.client.get(reverse("profile-public", args=[self.profile.username]))

        titles = [s["title"] for s in response.data["data"]["services"]]
        self.assertEqual(titles, ["Web Dev"])

    def test_google_maps_url_is_public(self):
        self.profile.google_maps_url = "https://maps.google.com/?q=17.3850,78.4867"
        self.profile.save(update_fields=["google_maps_url"])

        response = self.client.get(reverse("profile-public", args=[self.profile.username]))

        self.assertEqual(response.data["data"]["google_maps_url"], "https://maps.google.com/?q=17.3850,78.4867")

    def test_services_are_scoped_to_the_profile_owner(self):
        other = make_user(email="other-service-owner@example.com")
        CustomerService.objects.create(user=other, title="Someone else's service")

        response = self.client.get(reverse("profile-public", args=[self.profile.username]))

        self.assertEqual(response.data["data"]["services"], [])


class MyProfileTemplateSelectionTests(AuthenticatedAPITestCase):
    """Profile-template selection is no longer gated by which plan a
    customer's paid orders resolve to (NEXORA Classic/Premium are retired,
    and the frontend now offers all 5 of these templates to every customer)
    — see orders.services.get_allowed_templates. This customer has placed
    no paid orders at all (resolves to the base "classic" plan), yet must
    still be able to pick any of the 5 templates that used to be
    Custom-plan-exclusive."""

    def setUp(self):
        super().setUp()
        self.profile = Profile.ensure_for_user(self.user)

    def test_customer_with_no_paid_orders_can_select_any_of_the_5_templates(self):
        for template_id in ["luxury", "future", "nature", "glass", "impact"]:
            response = self.client.patch(
                reverse("profile-me"), {"selected_template": template_id}, format="json"
            )
            self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
            self.assertEqual(response.data["data"]["selected_template"], template_id)

    def test_selection_persists_across_requests(self):
        self.client.patch(reverse("profile-me"), {"selected_template": "future"}, format="json")

        response = self.client.get(reverse("profile-me"))

        self.assertEqual(response.data["data"]["selected_template"], "future")
        self.profile.refresh_from_db()
        self.assertEqual(self.profile.selected_template, "future")

    def test_available_templates_always_lists_the_same_5_ids(self):
        response = self.client.get(reverse("profile-me"))

        self.assertEqual(
            set(response.data["data"]["available_templates"]),
            {"luxury", "future", "nature", "glass", "impact"},
        )

    def test_rejects_a_template_id_that_does_not_exist(self):
        response = self.client.patch(reverse("profile-me"), {"selected_template": "not-a-real-template"}, format="json")
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)


class CustomFieldBulkSaveTests(AuthenticatedAPITestCase):
    """My Profile > Custom Fields > Save Changes (PUT custom-fields/bulk/)."""

    url = reverse("custom-field-bulk")

    def setUp(self):
        super().setUp()
        self.profile = Profile.ensure_for_user(self.user)

    def _save(self, fields):
        return self.client.put(self.url, {"fields": fields}, format="json")

    def _stored(self):
        return list(CustomField.objects.filter(profile=self.profile).values_list("label", "value", "display_order"))

    def test_creates_fields_in_order(self):
        response = self._save([{"label": "GST Number", "value": "36ABCDE1234F1Z5"}, {"label": "Experience", "value": "8 years"}])
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(self._stored(), [("GST Number", "36ABCDE1234F1Z5", 0), ("Experience", "8 years", 1)])
        self.assertEqual([f["label"] for f in response.data["data"]], ["GST Number", "Experience"])

    def test_resaving_updates_in_place_without_duplicates(self):
        first = self._save([{"label": "GST Number", "value": "old"}]).data["data"][0]
        for _ in range(3):
            response = self._save([{"id": first["id"], "label": "GST Number", "value": "new"}])
        self.assertEqual(response.data["data"][0]["id"], first["id"])
        self.assertEqual(self._stored(), [("GST Number", "new", 0)])

    def test_edit_delete_and_reorder_in_one_save(self):
        a, b, c = self._save(
            [{"label": "A", "value": "1"}, {"label": "B", "value": "2"}, {"label": "C", "value": "3"}]
        ).data["data"]
        self._save([{"id": c["id"], "label": "C", "value": "3"}, {"id": a["id"], "label": "A2", "value": "1"}])
        self.assertEqual(self._stored(), [("C", "3", 0), ("A2", "1", 1)])
        self.assertFalse(CustomField.objects.filter(id=b["id"]).exists())

    def test_empty_list_deletes_all(self):
        self._save([{"label": "A", "value": "1"}])
        self._save([])
        self.assertEqual(self._stored(), [])

    def test_drops_completely_empty_rows(self):
        self._save([{"label": "  ", "value": ""}, {"label": " Website ", "value": " example.com "}])
        self.assertEqual(self._stored(), [("Website", "example.com", 0)])

    def test_rejects_half_filled_rows_and_saves_nothing(self):
        self._save([{"label": "Keep", "value": "me"}])
        response = self._save([{"label": "Keep", "value": "changed"}, {"label": "GST Number", "value": ""}])
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("value", response.data["errors"]["fields"][1])
        self.assertEqual(self._stored(), [("Keep", "me", 0)])

    def test_rejects_values_over_the_column_length(self):
        response = self._save([{"label": "Long", "value": "x" * 256}])
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_cannot_modify_another_customers_field(self):
        other_profile = Profile.ensure_for_user(self.other_user)
        theirs = CustomField.objects.create(profile=other_profile, label="Secret", value="theirs")
        self._save([{"id": theirs.id, "label": "Hijacked", "value": "x"}])
        theirs.refresh_from_db()
        self.assertEqual((theirs.label, theirs.value), ("Secret", "theirs"))
        self.assertEqual(self._stored(), [("Hijacked", "x", 0)])

    def test_profile_update_does_not_touch_custom_fields(self):
        self._save([{"label": "GST Number", "value": "36ABCDE1234F1Z5"}])
        self.client.patch(reverse("profile-me"), {"website": "https://example.com", "custom_fields": []}, format="json")
        self.assertEqual(self._stored(), [("GST Number", "36ABCDE1234F1Z5", 0)])

    def test_requires_authentication(self):
        self.client.force_authenticate(user=None)
        self.assertEqual(self._save([]).status_code, status.HTTP_401_UNAUTHORIZED)


class PublicProfileCustomFieldTests(APITestCase):
    def setUp(self):
        self.user = make_user(email="card@example.com", full_name="Card Owner")
        self.profile = Profile.ensure_for_user(self.user)

    def _public_fields(self):
        response = self.client.get(reverse("profile-public", args=[self.profile.username]))
        return [(f["label"], f["value"]) for f in response.data["data"]["custom_fields"]]

    def test_shows_saved_fields_in_order(self):
        CustomField.objects.create(profile=self.profile, label="Experience", value="8 years", display_order=1)
        CustomField.objects.create(profile=self.profile, label="GST Number", value="36ABCDE1234F1Z5", display_order=0)
        self.assertEqual(self._public_fields(), [("GST Number", "36ABCDE1234F1Z5"), ("Experience", "8 years")])

    def test_hides_fields_missing_a_label_or_value(self):
        CustomField.objects.create(profile=self.profile, label="Filled", value="yes")
        CustomField.objects.create(profile=self.profile, label="No value", value=" ")
        CustomField.objects.create(profile=self.profile, label="", value="no label")
        self.assertEqual(self._public_fields(), [("Filled", "yes")])

    def test_reflects_latest_save_immediately(self):
        owner = self.client_class()
        owner.force_authenticate(user=self.user)
        owner.put(reverse("custom-field-bulk"), {"fields": [{"label": "Award", "value": "Best Designer 2025"}]}, format="json")
        self.assertEqual(self._public_fields(), [("Award", "Best Designer 2025")])
        owner.put(reverse("custom-field-bulk"), {"fields": []}, format="json")
        self.assertEqual(self._public_fields(), [])

    def test_private_profile_exposes_nothing(self):
        CustomField.objects.create(profile=self.profile, label="GST Number", value="36ABCDE1234F1Z5")
        self.profile.profile_public = False
        self.profile.save(update_fields=["profile_public"])
        response = self.client.get(reverse("profile-public", args=[self.profile.username]))
        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)
        self.assertNotIn("36ABCDE1234F1Z5", response.content.decode())

