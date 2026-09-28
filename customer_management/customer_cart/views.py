from rest_framework.views import APIView

from common.permissions import IsCustomerRole
from common.response import error, success

from . import services
from .serializers import AddCartItemSerializer, CartSerializer, UpdateCartItemSerializer


class CartView(APIView):
    """GET /api/customer/cart/ — always request.user's own cart. Never
    Cart.objects.first(), never an id taken from the request."""

    permission_classes = [IsCustomerRole]

    def get(self, request):
        cart = services.get_or_create_cart(request.user)
        return success(CartSerializer(cart).data)


class CartItemListCreateView(APIView):
    permission_classes = [IsCustomerRole]

    def post(self, request):
        serializer = AddCartItemSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        item = services.add_item(request.user, dict(serializer.validated_data))
        return success(CartSerializer(item.cart).data, message="Added to cart.", status=201)


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
        return success(CartSerializer(item.cart).data, message="Cart updated.")

    def delete(self, request, pk):
        item = services.get_owned_item(request.user, pk)
        if item is None:
            return error("Cart item not found.", status=404)
        cart = item.cart
        item.delete()
        return success(CartSerializer(cart).data, message="Item removed.")
