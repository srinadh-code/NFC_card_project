from rest_framework.permissions import BasePermission, SAFE_METHODS


class IsAdminRole(BasePermission):
    """Real role check — never trust a role claimed by the client."""

    def has_permission(self, request, view):
        user = request.user
        return bool(user and user.is_authenticated and (user.role == "ADMIN" or user.is_staff))


class IsCustomerRole(BasePermission):
    def has_permission(self, request, view):
        user = request.user
        return bool(user and user.is_authenticated and user.role == "CUSTOMER")


class IsRecipientCustomer(BasePermission):
    """CUSTOMER accounts holding the RECIPIENT role (accounts/roles.py) —
    the digital profile, card, QR, analytics and enquiry features. A
    purchaser-only account (bought cards for others) is refused, so these
    endpoints never create or expose a profile for it."""

    message = "This feature is available to card recipients only."

    def has_permission(self, request, view):
        from accounts.roles import is_recipient

        return is_recipient(request.user)


class IsOwner(BasePermission):
    """
    Object-level check that the object belongs to the requesting user.
    Looks for a `user` attribute on the object, falling back to `user_id`.
    Admins are not implicitly granted access here — combine with IsAdminRole
    in an OR permission if an endpoint should allow both.
    """

    def has_object_permission(self, request, view, obj):
        owner_id = getattr(obj, "user_id", None)
        if owner_id is None:
            owner = getattr(obj, "user", None)
            owner_id = getattr(owner, "id", None)
        return owner_id == request.user.id


class ReadOnly(BasePermission):
    def has_permission(self, request, view):
        return request.method in SAFE_METHODS
