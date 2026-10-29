from rest_framework.views import APIView

from common.permissions import IsCustomerRole
from common.response import error, success

from . import services
from .serializers import (
    AddCartItemSerializer,
    ApplyOfferSerializer,
    ApplyPromoCodeSerializer,
    AvailableOffersSerializer,
    CartSerializer,
    UpdateCartItemSerializer,
)


def _cart_response(cart, request, message=None, status=200):
    return success(CartSerializer(cart, context={"customer": request.user}).data, message=message, status=status)


class CartView(APIView):
    """GET /api/customer/cart/ — always request.user's own cart. Never
    Cart.objects.first(), never an id taken from the request."""

    permission_classes = [IsCustomerRole]

    def get(self, request):
        cart = services.get_or_create_cart(request.user)
        return _cart_response(cart, request)


class CartItemListCreateView(APIView):
    permission_classes = [IsCustomerRole]

    def post(self, request):
        serializer = AddCartItemSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        item = services.add_item(request.user, dict(serializer.validated_data))
        return _cart_response(item.cart, request, message="Added to cart.", status=201)


class CartItemDetailView(APIView):
    """PATCH (change quantity) / DELETE (remove) one cart item — both
    scoped by services.get_owned_item, which filters on
    cart__customer=request.user. A pk that belongs to a different
    customer's cart item resolves identically to a pk that doesn't exist
    at all: a plain 404, never a 403 that would confirm someone else's
    item exists."""

    permission_classes = [IsCustomerRole]

    def patch(self, request, pk):
        item = services.get_owned_item(request.user, pk)
        if item is None:
            return error("Cart item not found.", status=404)
        serializer = UpdateCartItemSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        item.qty = serializer.validated_data["qty"]
        item.save(update_fields=["qty", "updated_at"])
        return _cart_response(item.cart, request, message="Cart updated.")

    def delete(self, request, pk):
        item = services.get_owned_item(request.user, pk)
        if item is None:
            return error("Cart item not found.", status=404)
        cart = item.cart
        item.delete()
        return _cart_response(cart, request, message="Item removed.")


class CartPromoCodeView(APIView):
    """POST applies a promo code (validated against every eligible offer —
    see services.apply_promo_code); DELETE removes whatever's applied.
    Never a separate "is this code valid" check — applying IS the
    validation, so there's no window where a rejected code is stored."""

    permission_classes = [IsCustomerRole]

    def post(self, request):
        serializer = ApplyPromoCodeSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        cart, error_message = services.apply_promo_code(request.user, serializer.validated_data["code"])
        if error_message:
            return error(error_message, status=400)
        return _cart_response(cart, request, message="Promo code applied.")

    def delete(self, request):
        cart = services.remove_promo_code(request.user)
        return _cart_response(cart, request, message="Promo code removed.")


class CartAvailableOffersView(APIView):
    """GET /api/customer/cart/offers/ — the Checkout page's "Offers &
    Discounts" section: every offer currently in effect on this cart
    (`applied`), every offer that still needs an explicit "Apply Offer"
    click (`available` — no promo code, not automatic_apply), and every
    other offer that targets something in the cart but isn't in effect for
    this customer right now (`unavailable`, with the real reason). Never
    lists a promo-code-only offer — codes are only ever revealed to a
    customer through the offer's own marketing, not by browsing checkout."""

    permission_classes = [IsCustomerRole]

    def get(self, request):
        cart = services.get_or_create_cart(request.user)
        data = services.available_offers(request.user, cart)
        return success(AvailableOffersSerializer(data).data)


class CartApplyOfferView(APIView):
    """POST applies a specific offer by id — the "Apply Offer" button for
    an offer with no promo code that isn't automatic_apply (see
    services.apply_offer, which re-runs the exact eligibility checks
    common.discounts.find_eligible_offer would). DELETE removes whatever's
    manually applied this way."""

    permission_classes = [IsCustomerRole]

    def post(self, request):
        serializer = ApplyOfferSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        cart, error_message = services.apply_offer(request.user, serializer.validated_data["offer_id"])
        if error_message:
            return error(error_message, status=400)
        return _cart_response(cart, request, message="Offer applied.")

    def delete(self, request):
        cart = services.remove_offer(request.user)
        return _cart_response(cart, request, message="Offer removed.")
