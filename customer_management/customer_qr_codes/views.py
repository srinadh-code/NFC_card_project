from rest_framework.views import APIView

from common.permissions import IsCustomerRole
from common.response import error, success

from . import services
from .serializers import CustomerQrCodeSerializer


class CustomerQrCodeView(APIView):
    permission_classes = [IsCustomerRole]

    def get(self, request):
        qr = services.get_qr_code(request.user)
        if qr is None:
            return error("No QR code has been generated yet.", status=404)
        return success(CustomerQrCodeSerializer(qr, context={"request": request}).data)


class GenerateQrCodeView(APIView):
    permission_classes = [IsCustomerRole]

    def post(self, request):
        qr, created = services.generate_qr_code(request.user, request)
        message = "QR code generated." if created else "QR code already exists."
        return success(
            CustomerQrCodeSerializer(qr, context={"request": request}).data,
            message=message,
            status=201 if created else 200,
        )


class RegenerateQrCodeView(APIView):
    permission_classes = [IsCustomerRole]

    def post(self, request):
        qr = services.regenerate_qr_code(request.user, request)
        return success(
            CustomerQrCodeSerializer(qr, context={"request": request}).data,
            message="QR code regenerated.",
        )
