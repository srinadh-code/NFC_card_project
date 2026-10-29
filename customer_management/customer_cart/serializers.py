from decimal import Decimal

from rest_framework import serializers

from common.discounts import calculate_first_order_discount, find_eligible_offer, get_product_price

from .models import Cart, CartItem


class CartItemSerializer(serializers.ModelSerializer):
    """`price` stays the line's own stored per-unit price, unchanged in
    meaning — the discount fields below are computed fresh on every read
    (never stored on the cart item itself) from common.discounts, using
    the cart's own promo_code if one is set, so a price/offer change is
    reflected immediately without any cart row needing to be touched."""

    original_price = serializers.SerializerMethodField()
    discount_amount = serializers.SerializerMethodField()
    final_price = serializers.SerializerMethodField()
    offer_title = serializers.SerializerMethodField()

    class Meta:
        model = CartItem
        fields = [
            "id",
            "product_id",
            "name",
            "card_type",
            "color_name",
            "color_hex",
            "qty",
            "price",
            "original_price",
            "discount_amount",
            "final_price",
            "offer_title",
            "updated_at",
        ]
        read_only_fields = [
            "id",
            "original_price",
            "discount_amount",
            "final_price",
            "offer_title",
            "updated_at",
        ]

    def _pricing(self, obj):
        promo_code = self.context.get("promo_code") or ""
        customer = self.context.get("customer")
        selected_offer_id = self.context.get("selected_offer_id")
        original_price = get_product_price(obj.card_type)
        if original_price is None:
            # No matching catalog product (e.g. a retired card_type still
            # sitting in an old cart row) — never invent a discount for it.
            return {"original_price": obj.price, "discount_amount": Decimal("0.00"), "final_price": obj.price, "offer": None}
        offer = find_eligible_offer(
            obj.card_type, promo_code=promo_code or None, customer=customer, selected_offer_id=selected_offer_id
        )
        from common.discounts import calculate_price

        return calculate_price(original_price, offer)

    def get_original_price(self, obj):
        return self._pricing(obj)["original_price"]

    def get_discount_amount(self, obj):
        return self._pricing(obj)["discount_amount"]

    def get_final_price(self, obj):
        return self._pricing(obj)["final_price"]

    def get_offer_title(self, obj):
        offer = self._pricing(obj)["offer"]
        return (offer.offer_title or offer.title) if offer else None


class CartSerializer(serializers.ModelSerializer):
    """Always the requesting customer's own cart — see views.py, which
    never constructs this from anything but Cart.objects.get_or_create(
    customer=request.user). subtotal/discount/total are the same real
    per-item numbers CartItemSerializer computes, just summed — never a
    second, independent calculation."""

    items = serializers.SerializerMethodField()
    subtotal = serializers.SerializerMethodField()
    # `discount` stays the TOTAL combined discount (promotional + first
    # order) — unchanged in meaning for any existing consumer (e.g.
    # Cart.tsx's single "Discount" line) that just wants "how much came
    # off", so `subtotal - discount == total` always still holds there.
    # The breakdown fields below are additive, for Checkout's detailed
    # Order Summary.
    discount = serializers.SerializerMethodField()
    promotional_discount = serializers.SerializerMethodField()
    first_order_discount_amount = serializers.SerializerMethodField()
    first_order_discount_percentage = serializers.SerializerMethodField()
    is_first_order = serializers.SerializerMethodField()
    total = serializers.SerializerMethodField()
    promo_code_error = serializers.SerializerMethodField()

    class Meta:
        model = Cart
        fields = [
            "id",
            "items",
            "promo_code",
            "promo_code_error",
            "subtotal",
            "discount",
            "promotional_discount",
            "first_order_discount_amount",
            "first_order_discount_percentage",
            "is_first_order",
            "total",
            "updated_at",
        ]
        read_only_fields = fields

    def _totals(self, obj):
        """Computed once per serialization (DRF caches nothing across
        field methods on its own), then reused by items/subtotal/discount/
        total/promo_code_error so they can never disagree with each other —
        the exact same per-item pricing dicts back every one of those
        fields."""
        cache = self.context.setdefault("_totals_cache", {})
        if obj.id in cache:
            return cache[obj.id]

        cart_items = list(obj.items.all())
        item_serializer = CartItemSerializer(
            cart_items,
            many=True,
            context={
                "promo_code": obj.promo_code,
                "customer": self.context.get("customer"),
                "selected_offer_id": obj.applied_offer_id,
            },
        )
        items_data = item_serializer.data

        subtotal = Decimal("0.00")
        promotional_discount = Decimal("0.00")
        any_offer_matched = False
        for cart_item, item_data in zip(cart_items, items_data):
            # original_price (not cart_item.price) so subtotal always agrees
            # with discount_amount/final_price below — all three come from
            # the same common.discounts call. cart_item.price is only ever a
            # per-line fallback (see CartItemSerializer._pricing) for a
            # card_type with no matching catalog product at all; using it
            # here whenever a real product DOES exist would let subtotal
            # drift from what checkout/order creation actually charges.
            subtotal += Decimal(str(item_data["original_price"])) * cart_item.qty
            promotional_discount += Decimal(str(item_data["discount_amount"])) * cart_item.qty
            if item_data["offer_title"]:
                any_offer_matched = True

        # Second, separate discount layer — applied to the subtotal that's
        # *already* had the promotional discount taken off it (see
        # common.discounts.calculate_first_order_discount's stacking-rule
        # note). Never re-derives eligibility from anything the client
        # sent — customer comes from context (the authenticated request
        # user), same as everywhere else in this file.
        first_order = calculate_first_order_discount(subtotal - promotional_discount, self.context.get("customer"))

        result = {
            "items": items_data,
            "subtotal": subtotal,
            "promotional_discount": promotional_discount,
            "first_order_discount_amount": first_order["discount_amount"],
            "first_order_discount_percentage": first_order["percentage"],
            "is_first_order": first_order["is_first_order"],
            "discount": promotional_discount + first_order["discount_amount"],
            "total": first_order["final_amount"],
            "promo_code_matched": any_offer_matched,
        }
        cache[obj.id] = result
        return result

    def get_items(self, obj):
        return self._totals(obj)["items"]

    def get_subtotal(self, obj):
        return self._totals(obj)["subtotal"]

    def get_discount(self, obj):
        return self._totals(obj)["discount"]

    def get_promotional_discount(self, obj):
        return self._totals(obj)["promotional_discount"]

    def get_first_order_discount_amount(self, obj):
        return self._totals(obj)["first_order_discount_amount"]

    def get_first_order_discount_percentage(self, obj):
        return self._totals(obj)["first_order_discount_percentage"]

    def get_is_first_order(self, obj):
        return self._totals(obj)["is_first_order"]

    def get_total(self, obj):
        return self._totals(obj)["total"]

    def get_promo_code_error(self, obj):
        # Surfaced so the frontend can show "this code no longer applies"
        # without a separate request — a code can go stale (offer expired/
        # disabled) between when it was applied and any later cart read.
        if not obj.promo_code:
            return None
        if self._totals(obj)["promo_code_matched"]:
            return None
        return "This promo code is no longer valid."


class AddCartItemSerializer(serializers.Serializer):
    product_id = serializers.CharField(max_length=40)
    name = serializers.CharField(max_length=150)
    card_type = serializers.CharField(max_length=10)
    color_name = serializers.CharField(max_length=30)
    color_hex = serializers.CharField(max_length=10, required=False, allow_blank=True, default="")
    qty = serializers.IntegerField(min_value=1, default=1)
    price = serializers.DecimalField(max_digits=10, decimal_places=2, min_value=0)


class UpdateCartItemSerializer(serializers.Serializer):
    qty = serializers.IntegerField(min_value=1)


class ApplyPromoCodeSerializer(serializers.Serializer):
    code = serializers.CharField(max_length=50)


class ApplyOfferSerializer(serializers.Serializer):
    offer_id = serializers.IntegerField()


class AppliedOfferSerializer(serializers.Serializer):
    id = serializers.IntegerField()
    title = serializers.CharField()
    discount_type = serializers.CharField()
    discount_value = serializers.DecimalField(max_digits=10, decimal_places=2)
    promo_code = serializers.CharField(allow_null=True)
    end_at = serializers.DateTimeField(allow_null=True)
    # True only for the customer's own explicit selection (a typed promo
    # code, or an "Apply Offer" click) — a plain automatic_apply offer has
    # nothing for the customer to remove; it just stops if it stops being
    # eligible.
    can_remove = serializers.BooleanField()


class AvailableOfferSerializer(serializers.Serializer):
    """An offer that needs an explicit "Apply Offer" click — no promo code
    and not automatic_apply, but otherwise valid and eligible right now."""

    id = serializers.IntegerField()
    title = serializers.CharField()
    discount_type = serializers.CharField()
    discount_value = serializers.DecimalField(max_digits=10, decimal_places=2)
    end_at = serializers.DateTimeField(allow_null=True)


class UnavailableOfferSerializer(serializers.Serializer):
    id = serializers.IntegerField()
    title = serializers.CharField()
    reason = serializers.CharField()


class AvailableOffersSerializer(serializers.Serializer):
    applied = AppliedOfferSerializer(many=True)
    available = AvailableOfferSerializer(many=True)
    unavailable = UnavailableOfferSerializer(many=True)
