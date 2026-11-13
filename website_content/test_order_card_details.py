"""Order Card product details: bulk pricing tiers, nested admin editing,
gallery images (Cloudinary mocked), publish/visibility rules, and how the
cart and checkout price from the catalog rather than the client."""

from decimal import Decimal
from unittest import mock

from django.core.files.uploadedfile import SimpleUploadedFile
from django.urls import reverse
from rest_framework import status
from rest_framework.test import APITestCase

from common import discounts
from common.test_utils import AuthenticatedAPITestCase, make_user
from customer_management.customer_addresses.models import CustomerAddress
from customer_management.customer_cart.models import CartItem
from orders.models import Order

from .models import OrderCardProduct, OrderCardProductImage, OrderCardProductOffer

TIERS = [
    {"label": "Buy 1", "min_quantity": 1, "unit_price": "500.00", "is_active": True},
    {"label": "Buy 3", "min_quantity": 3, "unit_price": "475.00", "is_active": True},
    {"label": "Buy 5", "min_quantity": 5, "unit_price": "450.00", "is_active": True},
]


def _set_tiers(product, tiers=TIERS):
    product.offers.all().delete()
    for i, tier in enumerate(tiers):
        product.offers.create(display_order=i, **tier)
    product.price = Decimal(tiers[0]["unit_price"])
    product.save(update_fields=["price"])


def _png(name="card.png"):
    return SimpleUploadedFile(name, b"\x89PNG\r\n\x1a\n" + b"0" * 64, content_type="image/png")


class BulkPricingTests(APITestCase):
    def setUp(self):
        self.product = OrderCardProduct.objects.get(slug="custom")
        _set_tiers(self.product)

    def test_unit_price_follows_the_largest_tier_reached(self):
        expected = {1: "500.00", 2: "500.00", 3: "475.00", 4: "475.00", 5: "450.00", 20: "450.00"}
        for qty, price in expected.items():
            with self.subTest(qty=qty):
                self.assertEqual(self.product.unit_price_for(qty), Decimal(price))

    def test_hidden_tier_is_ignored(self):
        self.product.offers.filter(min_quantity=5).update(is_active=False)
        self.assertEqual(self.product.unit_price_for(5), Decimal("475.00"))

    def test_catalog_lookup_by_product_id(self):
        self.assertEqual(discounts.get_product_price("CUSTOM", product_id="PRD-NEXORA-CUSTOM", qty=3), Decimal("475.00"))
        self.product.is_published = False
        self.product.save(update_fields=["is_published"])
        self.assertIsNone(discounts.get_catalog_product("CUSTOM", "PRD-NEXORA-CUSTOM"))


class PublicProductPayloadTests(APITestCase):
    def setUp(self):
        self.product = OrderCardProduct.objects.get(slug="google-review")
        _set_tiers(self.product)

    def test_payload_has_details_and_only_visible_children(self):
        self.product.offers.filter(min_quantity=5).update(is_active=False)
        self.product.feature_items.create(label="Hidden feature", is_active=False)
        self.product.timeline_stages.create(title="Hidden stage", is_active=False)

        response = self.client.get(reverse("public-order-card-product", args=["google-review"]))

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        data = response.data["data"]
        self.assertEqual([o["label"] for o in data["offers"]], ["Buy 1", "Buy 3"])
        self.assertNotIn("Hidden feature", [f["label"] for f in data["feature_items"]])
        self.assertNotIn("Hidden stage", [s["title"] for s in data["timeline_stages"]])
        self.assertEqual(len(data["timeline_stages"]), 4)
        self.assertEqual(data["customisation_heading"], "How it works?")
        self.assertEqual(data["product_id"], "PRD-NEXORA-GOOGLE-REVIEW")

    def test_unpublished_or_inactive_product_is_hidden(self):
        for field in ["is_published", "is_active"]:
            with self.subTest(field=field):
                OrderCardProduct.objects.filter(pk=self.product.pk).update(**{"is_published": True, "is_active": True, field: False})
                listing = self.client.get(reverse("public-order-card")).data["data"]["products"]
                self.assertNotIn("google-review", [p["slug"] for p in listing])
                detail = self.client.get(reverse("public-order-card-product", args=["google-review"]))
                self.assertEqual(detail.status_code, status.HTTP_404_NOT_FOUND)


class AdminProductEditingTests(APITestCase):
    def setUp(self):
        self.admin = make_user(email="oc-details-admin@example.com", role="ADMIN")
        self.client.force_authenticate(user=self.admin)
        self.product = OrderCardProduct.objects.get(slug="custom")
        self.url = reverse("admin-order-card-product-detail", args=[self.product.pk])

    def test_saves_features_offers_and_timeline_and_syncs_price(self):
        response = self.client.patch(
            self.url,
            {
                "offers": TIERS,
                "feature_items": [{"label": "NFC Enabled", "icon": "Nfc"}, {"label": "QR Code", "icon": "QrCode"}],
                "timeline_stages": [{"title": "Order Placed", "estimate": "Day 0"}],
                "customisation_heading": "How do I customise my card?",
            },
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
        data = response.data["data"]
        self.assertEqual(data["price"], "500.00")
        self.assertEqual([o["min_quantity"] for o in data["offers"]], [1, 3, 5])
        self.assertEqual([f["label"] for f in data["feature_items"]], ["NFC Enabled", "QR Code"])
        self.assertEqual(data["features"], "NFC Enabled\nQR Code")
        self.assertEqual(len(data["timeline_stages"]), 1)

    def test_partial_update_leaves_collections_alone(self):
        before = self.product.feature_items.count()
        self.client.patch(self.url, {"is_active": False}, format="json")
        self.assertEqual(self.product.feature_items.count(), before)
        self.assertEqual(self.product.offers.count(), 3)

    def test_rejects_invalid_pricing(self):
        cases = {
            "no single-card tier": [{"label": "Buy 3", "min_quantity": 3, "unit_price": "475.00"}],
            "duplicate quantity": [TIERS[0], {**TIERS[1], "min_quantity": 1}],
            "bulk dearer than single": [TIERS[0], {**TIERS[1], "unit_price": "600.00"}],
            "zero price": [{**TIERS[0], "unit_price": "0.00"}],
            "missing label": [{**TIERS[0], "label": " "}],
        }
        for name, offers in cases.items():
            with self.subTest(name):
                response = self.client.patch(self.url, {"offers": offers}, format="json")
                self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(OrderCardProduct.objects.get(pk=self.product.pk).price, self.product.price)

    def test_rejects_slug_too_long_for_a_product_id(self):
        response = self.client.post(
            reverse("admin-order-card-products"),
            {"slug": "x" * 30, "name": "Long", "price": "10.00", "card_type": "CUSTOM"},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_customer_cannot_edit(self):
        self.client.force_authenticate(user=make_user(email="oc-details-customer@example.com"))
        response = self.client.patch(self.url, {"name": "Hacked"}, format="json")
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)


@mock.patch("website_content.views.admin.delete_image")
@mock.patch("website_content.views.admin.upload_image")
class AdminGalleryTests(APITestCase):
    def setUp(self):
        self.admin = make_user(email="oc-gallery-admin@example.com", role="ADMIN")
        self.client.force_authenticate(user=self.admin)
        self.product = OrderCardProduct.objects.create(slug="gallery", name="Gallery", price="10.00", card_type="CUSTOM")
        self.images_url = reverse("admin-order-card-product-images", args=[self.product.pk])
        self.counter = 0

    def _fake_upload(self, *args, **kwargs):
        self.counter += 1
        return {"url": f"https://res.cloudinary.com/demo/image/upload/img{self.counter}.png", "public_id": f"oc/img{self.counter}"}

    def _upload(self, upload_mock, **extra):
        upload_mock.side_effect = self._fake_upload
        return self.client.post(self.images_url, {"image": _png(), **extra}, format="multipart")

    def _image_url(self, image):
        return reverse("admin-order-card-product-image-detail", args=[self.product.pk, image.pk])

    def test_upload_sets_first_image_primary_and_mirrors_url(self, upload_mock, delete_mock):
        first = self._upload(upload_mock)
        self._upload(upload_mock)

        self.assertEqual(first.status_code, status.HTTP_200_OK)
        images = list(self.product.images.all())
        self.assertEqual([img.is_primary for img in images], [True, False])
        self.product.refresh_from_db()
        self.assertEqual(self.product.image_url, images[0].image_url)

    def test_set_primary_reorder_replace_and_delete(self, upload_mock, delete_mock):
        for _ in range(3):
            self._upload(upload_mock)
        a, b, c = self.product.images.all()

        self.client.patch(self._image_url(b), {"is_primary": True}, format="json")
        self.product.refresh_from_db()
        self.assertEqual(self.product.image_url, b.image_url)

        reorder = self.client.patch(
            reverse("admin-order-card-product-images-reorder", args=[self.product.pk]), {"order": [c.pk, a.pk, b.pk]}, format="json"
        )
        self.assertEqual([img["id"] for img in reorder.data["data"]["images"]], [c.pk, a.pk, b.pk])

        replaced = self.client.post(self._image_url(b), {"image": _png()}, format="multipart")
        self.assertEqual(replaced.status_code, status.HTTP_200_OK)
        delete_mock.assert_called_with("oc/img2")
        b.refresh_from_db()
        self.product.refresh_from_db()
        self.assertEqual(self.product.image_url, b.image_url)  # still primary, new file

        self.client.delete(self._image_url(b))
        delete_mock.assert_called_with("oc/img4")
        self.product.refresh_from_db()
        remaining = list(self.product.images.all())
        self.assertEqual(len(remaining), 2)
        self.assertTrue(remaining[0].is_primary)
        self.assertEqual(self.product.image_url, remaining[0].image_url)

    def test_failed_upload_saves_nothing(self, upload_mock, delete_mock):
        from rest_framework.exceptions import ValidationError

        upload_mock.side_effect = ValidationError({"image": ["Image upload failed: boom"]})
        response = self.client.post(self.images_url, {"image": _png()}, format="multipart")
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertFalse(self.product.images.exists())

    def test_deleting_product_destroys_every_asset(self, upload_mock, delete_mock):
        self._upload(upload_mock)
        self._upload(upload_mock)
        self.client.delete(reverse("admin-order-card-product-detail", args=[self.product.pk]))
        self.assertEqual(sorted(c.args[0] for c in delete_mock.call_args_list), ["oc/img1", "oc/img2"])
        self.assertFalse(OrderCardProductImage.objects.filter(product_id=self.product.pk).exists())

    def test_customer_cannot_upload(self, upload_mock, delete_mock):
        self.client.force_authenticate(user=make_user(email="oc-gallery-customer@example.com"))
        response = self.client.post(self.images_url, {"image": _png()}, format="multipart")
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)
        upload_mock.assert_not_called()


class CartAndCheckoutPricingTests(AuthenticatedAPITestCase):
    """The cart and checkout price from the catalog's tiers — never from the
    price a request sends."""

    def setUp(self):
        super().setUp()
        self.product = OrderCardProduct.objects.get(slug="custom")
        _set_tiers(self.product)
        patcher = mock.patch.object(discounts, "FIRST_ORDER_DISCOUNT_ENABLED", False)
        patcher.start()
        self.addCleanup(patcher.stop)

    def _add(self, qty, **overrides):
        payload = {
            "product_id": "PRD-NEXORA-CUSTOM",
            "name": "Anything",
            "card_type": "CUSTOM",
            "color_name": "Custom",
            "qty": qty,
            "price": "1.00",  # a tampered price — must be ignored
            **overrides,
        }
        return self.client.post(reverse("customer-cart-items"), payload, format="json")

    def test_cart_uses_tier_price_and_ignores_client_price(self):
        response = self._add(3)

        self.assertEqual(response.status_code, status.HTTP_201_CREATED, response.data)
        item = CartItem.objects.get(cart__customer=self.user)
        self.assertEqual(item.price, Decimal("475.00"))
        self.assertEqual(item.name, self.product.name)
        line = response.data["data"]["items"][0]
        self.assertEqual(str(line["final_price"]), "475.00")
        self.assertEqual(line["pricing_tier"], "Buy 3")

    def test_adding_again_merges_and_reprices(self):
        self._add(2)
        response = self._add(3)
        line = response.data["data"]["items"][0]
        self.assertEqual(line["qty"], 5)
        self.assertEqual(str(line["final_price"]), "450.00")
        self.assertEqual(CartItem.objects.filter(cart__customer=self.user).count(), 1)

    def test_changing_qty_reprices(self):
        self._add(5)
        item = CartItem.objects.get(cart__customer=self.user)
        response = self.client.patch(reverse("customer-cart-item-detail", args=[item.pk]), {"qty": 1}, format="json")
        self.assertEqual(str(response.data["data"]["items"][0]["final_price"]), "500.00")
        item.refresh_from_db()
        self.assertEqual(item.price, Decimal("500.00"))

    def test_rejects_unavailable_products_and_bad_quantities(self):
        self.assertEqual(self._add(1, product_id="PRD-NEXORA-NOPE", card_type="").status_code, 400)
        self.assertEqual(self._add(0).status_code, 400)
        self.assertEqual(self._add(101).status_code, 400)
        self.product.is_published = False
        self.product.save(update_fields=["is_published"])
        self.assertEqual(self._add(1).status_code, 400)
        self.assertFalse(CartItem.objects.exists())

    def _address(self):
        return CustomerAddress.objects.create(
            customer=self.user, full_name="Test Customer", phone="9999999999", address_line1="123 Main St",
            city="Hyderabad", district="Hyderabad", state="Telangana", pincode="500001", country="India",
        )

    def test_order_records_tier_price_and_label(self):
        self._add(3)
        response = self.client.post(
            reverse("my-orders"), {
                "payment_method": "COD",
                "address_id": self._address().pk,
                "recipients": [
                    {"full_name": f"Tier Recipient {index}", "email": f"tier{index}@example.com", "phone": "+917700900123"}
                    for index in range(3)
                ],
            }, format="json"
        )

        self.assertEqual(response.status_code, status.HTTP_201_CREATED, response.data)
        order = Order.objects.get(pk=response.data["data"]["id"])
        item = order.items.get()
        self.assertEqual((item.qty, item.price, item.pricing_tier), (3, Decimal("475.00"), "Buy 3"))
        self.assertEqual(order.amount, Decimal("1425.00"))
        self.assertEqual(response.data["data"]["items"][0]["pricing_tier"], "Buy 3")

    def test_checkout_blocks_a_product_hidden_after_it_was_added(self):
        self._add(1)
        OrderCardProduct.objects.filter(pk=self.product.pk).update(is_published=False)
        response = self.client.post(
            reverse("my-orders"), {"payment_method": "UPI", "address_id": self._address().pk}, format="json"
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertFalse(Order.objects.exists())

    def test_tier_price_then_promotional_offer(self):
        """Existing offers still apply on top of the bulk price."""
        from customer_management.customer_notifications.models import Announcement

        Announcement.objects.create(
            title="10% off", announcement_type=Announcement.AnnouncementType.OFFER, is_published=True,
            discount_type=Announcement.DiscountType.PERCENTAGE, discount_percentage=Decimal("10"), automatic_apply=True,
        )
        response = self._add(3)
        line = response.data["data"]["items"][0]
        self.assertEqual(str(line["original_price"]), "475.00")
        self.assertEqual(str(line["final_price"]), "427.50")


class OfferRowSanityTests(APITestCase):
    def test_seeded_tiers_keep_live_prices(self):
        """The data migration seeds Buy 3/Buy 5 hidden at the existing price."""
        for product in OrderCardProduct.objects.all():
            offers = list(product.offers.all())
            self.assertEqual([o.min_quantity for o in offers], [1, 3, 5])
            self.assertEqual({o.unit_price for o in offers}, {product.price})
            self.assertEqual([o.is_active for o in offers], [True, False, False])
            self.assertIsInstance(offers[0], OrderCardProductOffer)
