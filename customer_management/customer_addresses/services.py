from .models import CustomerAddress


def list_addresses(user):
    return CustomerAddress.objects.filter(customer=user)


def get_owned_address(user, pk):
    return CustomerAddress.objects.filter(pk=pk, customer=user).first()


def create_address(user, validated_data):
    # A customer's very first saved address becomes their default
    # automatically — there's no meaningful "pick a default" step when
    # there's only ever been one address to choose from.
    is_first = not CustomerAddress.objects.filter(customer=user).exists()
    if is_first:
        validated_data["is_default"] = True
    return CustomerAddress.objects.create(customer=user, **validated_data)


def set_default_address(user, pk):
    address = get_owned_address(user, pk)
    if address is None:
        return None
    address.is_default = True
    address.save(update_fields=["is_default", "updated_at"])
    return address


def delete_address(address):
    """Deletes the address; if it was the default, promotes the
    next-most-recently-updated remaining address (if any) so the customer
    always has a sensible default rather than none at all."""
    customer = address.customer
    was_default = address.is_default
    address.delete()
    if was_default:
        fallback = CustomerAddress.objects.filter(customer=customer).order_by("-updated_at").first()
        if fallback is not None:
            fallback.is_default = True
            fallback.save(update_fields=["is_default", "updated_at"])
