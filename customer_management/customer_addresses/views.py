from rest_framework.throttling import UserRateThrottle
from rest_framework.views import APIView

from common.permissions import IsCustomerRole
from common.response import error, success

from . import pincode as pincode_service
from . import services
from .serializers import CustomerAddressSerializer


class CustomerAddressListCreateView(APIView):
    permission_classes = [IsCustomerRole]

    def get(self, request):
        items = services.list_addresses(request.user)
        return success(CustomerAddressSerializer(items, many=True).data)

    def post(self, request):
        serializer = CustomerAddressSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        address = services.create_address(request.user, dict(serializer.validated_data))
        return success(CustomerAddressSerializer(address).data, message="Address added.", status=201)


class CustomerAddressDetailView(APIView):
    permission_classes = [IsCustomerRole]

    def _get_or_404(self, request, pk):
        return services.get_owned_address(request.user, pk)

    def get(self, request, pk):
        address = self._get_or_404(request, pk)
        if address is None:
            return error("Address not found.", status=404)
        return success(CustomerAddressSerializer(address).data)

    def _update(self, request, pk, partial):
        address = self._get_or_404(request, pk)
        if address is None:
            return error("Address not found.", status=404)
        serializer = CustomerAddressSerializer(address, data=request.data, partial=partial)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return success(serializer.data, message="Address updated.")

    def put(self, request, pk):
        return self._update(request, pk, partial=False)

    def patch(self, request, pk):
        return self._update(request, pk, partial=True)

    def delete(self, request, pk):
        address = self._get_or_404(request, pk)
        if address is None:
            return error("Address not found.", status=404)
        services.delete_address(address)
        return success(message="Address removed.")


class CustomerAddressSetDefaultView(APIView):
    permission_classes = [IsCustomerRole]

    def post(self, request, pk):
        address = services.set_default_address(request.user, pk)
        if address is None:
            return error("Address not found.", status=404)
        return success(CustomerAddressSerializer(address).data, message="Default address updated.")


class PincodeLookupThrottle(UserRateThrottle):
    scope = "pincode_lookup"


class PincodeLookupView(APIView):
    """Auto-fill source for the address form: the state, districts and
    post offices India Post has for a PIN. Purely informational — the
    authoritative check is CustomerAddressSerializer.validate."""

    permission_classes = [IsCustomerRole]
    throttle_classes = [PincodeLookupThrottle]

    def get(self, request, pincode):
        if not pincode_service.is_valid_pincode_format(pincode):
            return error(pincode_service.FORMAT_MESSAGE, errors={"pincode": [pincode_service.FORMAT_MESSAGE]})
        try:
            info = pincode_service.lookup_pincode(pincode)
        except pincode_service.PincodeServiceUnavailable:
            return error(pincode_service.UNAVAILABLE_MESSAGE, status=503)
        if info is None:
            return error(pincode_service.NOT_FOUND_MESSAGE, errors={"pincode": [pincode_service.NOT_FOUND_MESSAGE]})
        return success(info.as_dict())


class CustomerAddressVerifyView(APIView):
    """Re-checks a saved address against the PIN directory — checkout calls
    this for the selected address so an address saved before verification
    existed (or with a since-changed rule) can't be ordered to unverified.
    The order create view runs the same check again server-side."""

    permission_classes = [IsCustomerRole]
    throttle_classes = [PincodeLookupThrottle]

    def post(self, request, pk):
        address = services.get_owned_address(request.user, pk)
        if address is None:
            return error("Address not found.", status=404)
        try:
            result = pincode_service.verify_saved_address(address)
        except pincode_service.PincodeServiceUnavailable:
            return error(pincode_service.UNAVAILABLE_MESSAGE, status=503)
        return success(
            result.as_dict(),
            message="Address details verified." if result.verified else result.errors["pincode"],
        )
