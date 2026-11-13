"""Mounted-route authorization inventory and regression matrix.

Enumerates URL callbacks rather than scanning source declarations: inherited
CMS methods, existing router actions, aliases and format suffixes are included.
Public handlers are never executed by the permission matrix. Private handlers
are guarded so a failed authorization check cannot mutate a fixture or call an
external integration.
"""
import inspect
import re
from contextlib import nullcontext
from dataclasses import dataclass
from pathlib import Path
from unittest.mock import patch

from django.urls import URLResolver, get_resolver, reverse
from rest_framework.permissions import AllowAny
from rest_framework.test import APIRequestFactory, APITestCase, force_authenticate
from rest_framework.views import APIView

from common.permissions import IsAdminRole
from common.test_utils import AuthenticatedAPITestCase, make_user

METHODS = ("GET", "POST", "PUT", "PATCH", "DELETE")

# This is a purpose-based exception list, independent of the effective
# permissions. Accidentally changing a private view to AllowAny must fail.
PUBLIC_VIEWS = {
    "accounts.views.RegisterView",
    "accounts.views.VerifyEmailView",
    "accounts.views.ResendOtpView",
    "accounts.views.LoginView",
    "accounts.views.AccountActivationCheckView",
    "accounts.views.AccountActivationCompleteView",
    "accounts.views.PurchaserSetupRequestView",
    "accounts.views.ForgotPasswordView",
    "accounts.views.VerifyResetOtpView",
    "accounts.views.ResetPasswordView",
    "accounts.views.GoogleLoginView",
    "accounts.views.AccountTokenRefreshView",
    "rest_framework_simplejwt.views.TokenRefreshView",
    "orders.views.PublicOrderTrackingView",
    "orders.views.OrderTrackingByTokenView",
    "nfc_cards.views.CardResolveView",
    "nfc_cards.views.TrackEventView",
    "profiles.views.PublicProfileView",
    "customer_management.customer_addresses.views.PincodeLookupView",
    "customer_management.customer_addresses.views.GeocodeSearchView",
    "customer_management.customer_addresses.views.GeocodeReverseView",
    "customer_management.customer_analytics.views.TrackSocialClickView",
    "customer_management.customer_notifications.views.PublicAnnouncementListView",
    "testimonials.views.PublicTestimonialListAPIView",
    "payments.views.RazorpayConfigView",
    "payments.views.RecipientEmailAvailabilityView",
    "payments.views.CheckoutCancelView",
    "payments.views.RazorpayCheckoutView",
    "payments.views.CheckoutOtpSendView",
    "payments.views.CheckoutOtpVerifyView",
    "payments.views.RazorpayVerifyView",
    "payments.views.DummyPaymentConfirmView",
    "payments.views.RazorpayWebhookView",
}


@dataclass
class MountedEndpoint:
    route: str
    callback: object
    kwargs: dict

    @property
    def view_class(self):
        return self.callback.cls

    @property
    def class_name(self):
        return f"{self.view_class.__module__}.{self.view_class.__name__}"

    @property
    def actions(self):
        return getattr(self.callback, "actions", {})

    @property
    def methods(self):
        if self.actions:
            return [method for method in METHODS if method.lower() in self.actions]
        return [method for method in METHODS if method.lower() in self.view_class.http_method_names and callable(getattr(self.view_class, method.lower(), None))]

    @property
    def is_admin(self):
        return (
            self.view_class.__module__.startswith("admin_api.")
            or self.view_class.__module__ == "website_content.views.admin"
            or "/admin/" in self.route
        )

    def is_public(self, method):
        if self.class_name == "customer_management.customer_leads.views.CustomerLeadsView":
            return method == "POST"
        return (
            self.class_name in PUBLIC_VIEWS
            or self.view_class.__module__ == "website_content.views.public"
        )

    def permissions(self, method):
        view = self.view_class(**self.callback.initkwargs)
        view.args, view.kwargs = (), self.kwargs
        if self.actions:
            view.action_map = self.actions
        raw = APIRequestFactory().generic(method, "/security-inventory/")
        view.request = view.initialize_request(raw)
        return view.get_permissions()


def mounted_api_endpoints(patterns=None, prefix="", defaults=None):
    """Yield only actually mounted DRF callbacks, including nested patterns."""
    if patterns is None:
        patterns = get_resolver().url_patterns
    defaults = defaults or {}
    for pattern in patterns:
        route = prefix + str(pattern.pattern)
        values = {**defaults}
        for name, converter in getattr(pattern.pattern, "converters", {}).items():
            values[name] = 1 if converter.__class__.__name__ == "IntConverter" else "security-target"
        for name in getattr(pattern.pattern, "regex", re.compile("")).groupindex:
            values[name] = "json" if name == "format" else "1"
        values.update(getattr(pattern, "default_args", {}))
        if isinstance(pattern, URLResolver):
            yield from mounted_api_endpoints(pattern.url_patterns, route, values)
            continue
        callback = pattern.callback
        cls = getattr(callback, "cls", None)
        if route.startswith("api/") and cls is not None and issubclass(cls, APIView):
            yield MountedEndpoint("/" + route, callback, values)


def write_endpoint_inventory(destination):
    """Explicit reporting command; never writes during normal test discovery."""
    endpoints = list(mounted_api_endpoints())
    unique = {e.class_name for e in endpoints}
    operations = sum(len(e.methods) for e in endpoints)
    rows = [
        "# Mounted API security inventory",
        "",
        f"Generated from Django's mounted URL resolver: **{len(endpoints)} route patterns, {len(unique)} concrete DRF view classes, {operations} implemented GET/POST/PUT/PATCH/DELETE route-method combinations**.",
        "",
        "Includes inherited CMS handlers, existing profile ModelViewSet/router actions, legacy aliases and router format suffixes. HEAD follows GET where available; DRF supplies OPTIONS. Unsupported methods return 405 after authentication/permission checks. Route regex notation is retained for exact matching.",
        "",
        "The regression matrix tests every private pattern against anonymous GET/POST/PUT/PATCH/DELETE and every admin pattern against an activated normal customer for those five methods. Public handlers are not invoked. Mixed public lead submission retains public POST and private GET. Passing this matrix proves the endpoint permission barrier only; owner-scoped queries, payment proofs and public serializers require the separate focused tests and audit.",
        "",
        "`customer_management.customer_orders` is an installed but **unmounted legacy app**. Its client-priced serializer is excluded from exposed API findings. `/api/customer/orders/` resolves to the canonical `orders` app.",
        "",
        "| Mounted pattern | Implemented methods / actions | Effective permissions by method | View class | Source |",
        "| --- | --- | --- | --- | --- |",
    ]
    backend = Path(__file__).resolve().parents[1]
    for endpoint in sorted(endpoints, key=lambda e: (e.route, e.class_name)):
        methods, permissions = [], []
        for method in endpoint.methods:
            action = endpoint.actions.get(method.lower())
            methods.append(f"{method} ({action})" if action else method)
            names = ", ".join(type(p).__name__ for p in endpoint.permissions(method)) or "No permission class (public token endpoint)"
            permissions.append(f"{method}: {names}")
        source = Path(inspect.getfile(endpoint.view_class))
        try:
            source_label = source.relative_to(backend).as_posix()
        except ValueError:
            source_label = "third-party DRF / SimpleJWT"
        rows.append(f"| `{endpoint.route}` | {'<br>'.join(methods)} | {'<br>'.join(permissions)} | `{endpoint.class_name}` | `{source_label}` |")
    Path(destination).write_text("\n".join(rows) + "\n", encoding="utf-8")
    return {"patterns": len(endpoints), "classes": len(unique), "implemented_methods": operations}


class MountedPermissionSecurityTests(APITestCase):
    def setUp(self):
        self.factory = APIRequestFactory()
        self.customer = make_user(email="permission-matrix@example.com")
        self.endpoints = list(mounted_api_endpoints())

    def invoke_guarded(self, endpoint, method, user=None):
        raw = self.factory.generic(method, "/security-permission-check/", data=b"{}", content_type="application/json")
        if user is not None:
            force_authenticate(raw, user=user)
        handler = endpoint.actions.get(method.lower(), method.lower())
        guard = patch.object(endpoint.view_class, handler, side_effect=AssertionError(f"Protected handler reached before denial: {endpoint.class_name} {method}")) if hasattr(endpoint.view_class, handler) else nullcontext()
        with guard:
            return endpoint.callback(raw, **endpoint.kwargs)

    def test_inventory_contains_inherited_methods_router_actions_and_aliases(self):
        classes = {endpoint.class_name for endpoint in self.endpoints}
        self.assertGreater(len(self.endpoints), 100)
        self.assertNotIn("customer_management.customer_orders.views.CustomerOrderListCreateView", classes)
        self.assertTrue(any(endpoint.actions.get("put") == "bulk" for endpoint in self.endpoints))
        self.assertTrue(any(endpoint.actions.get("patch") == "partial_update" for endpoint in self.endpoints))
        self.assertTrue(any(endpoint.view_class.__module__ == "website_content.views.admin" and "DELETE" in endpoint.methods for endpoint in self.endpoints))
        self.assertTrue(any(endpoint.route.startswith("/api/nfc/admin/cards/") for endpoint in self.endpoints))

    def test_every_private_route_rejects_anonymous_read_and_mutation_methods(self):
        checked = 0
        for endpoint in self.endpoints:
            for method in METHODS:
                if endpoint.is_public(method):
                    continue
                with self.subTest(route=endpoint.route, method=method):
                    response = self.invoke_guarded(endpoint, method)
                    self.assertIn(response.status_code, (401, 403))
                    checked += 1
        self.assertGreater(checked, 500)

    def test_every_admin_route_rejects_normal_customer_for_all_five_methods(self):
        checked = 0
        for endpoint in self.endpoints:
            if not endpoint.is_admin:
                continue
            for method in METHODS:
                with self.subTest(route=endpoint.route, method=method):
                    self.assertTrue(any(isinstance(permission, IsAdminRole) for permission in endpoint.permissions(method)))
                    response = self.invoke_guarded(endpoint, method, self.customer)
                    self.assertEqual(response.status_code, 403)
                    checked += 1
        self.assertGreater(checked, 250)

    def test_intentionally_public_operations_keep_their_permission_contract(self):
        checked = 0
        for endpoint in self.endpoints:
            for method in endpoint.methods:
                if not endpoint.is_public(method):
                    continue
                with self.subTest(route=endpoint.route, method=method):
                    permissions = endpoint.permissions(method)
                    self.assertTrue(not permissions or all(isinstance(permission, AllowAny) for permission in permissions))
                    checked += 1
        self.assertGreater(checked, 20)


class ProfileRouterOwnershipSecurityTests(AuthenticatedAPITestCase):
    def test_foreign_profile_child_retrieve_update_delete_and_bulk_are_isolated(self):
        from profiles.models import CustomField, Profile

        own_profile = Profile.ensure_for_user(self.user)
        other_profile = Profile.ensure_for_user(self.other_user)
        other = CustomField.objects.create(profile=other_profile, label="Private", value="other-owned", display_order=4)
        own = CustomField.objects.create(profile=own_profile, label="Own", value="mine")
        detail = reverse("custom-field-detail", args=[other.pk])
        self.assertEqual(self.client.get(detail).status_code, 404)
        for method in ("put", "patch"):
            self.assertEqual(getattr(self.client, method)(detail, {"label": "Changed", "value": "hijack", "profile": own_profile.pk}, format="json").status_code, 404)
        self.assertEqual(self.client.delete(detail).status_code, 404)
        bulk = self.client.put(reverse("custom-field-bulk"), {"fields": [{"id": own.pk, "label": "Own", "value": "updated"}, {"id": other.pk, "label": "Copied", "value": "safe-copy"}]}, format="json")
        self.assertEqual(bulk.status_code, 200, bulk.content)
        other.refresh_from_db()
        self.assertEqual((other.profile_id, other.label, other.value, other.display_order), (other_profile.pk, "Private", "other-owned", 4))
        self.assertTrue(CustomField.objects.filter(profile=own_profile, label="Copied", value="safe-copy").exists())
