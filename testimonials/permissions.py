from rest_framework.permissions import BasePermission

from .services import NOT_ELIGIBLE_MESSAGE, has_purchased_card


class HasPurchasedCard(BasePermission):
    """Gate for creating a testimonial: authenticated AND at least one PAID
    order. `message` becomes the response's top-level `message` via
    common.response.custom_exception_handler."""

    message = NOT_ELIGIBLE_MESSAGE

    def has_permission(self, request, view):
        user = request.user
        return bool(user and user.is_authenticated and has_purchased_card(user))
