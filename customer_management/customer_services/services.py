from .models import CustomerService


def list_services(user):
    return CustomerService.objects.filter(user=user)


def get_owned_service(user, pk):
    return CustomerService.objects.filter(pk=pk, user=user).first()


def create_service(user, validated_data):
    validated_data.pop("display_order", None)
    next_order = CustomerService.objects.filter(user=user).count()
    return CustomerService.objects.create(user=user, display_order=next_order, **validated_data)


def reorder_services(user, ordered_ids):
    owned_ids = set(CustomerService.objects.filter(user=user).values_list("id", flat=True))
    for index, service_id in enumerate(ordered_ids):
        if service_id in owned_ids:
            CustomerService.objects.filter(id=service_id).update(display_order=index)
