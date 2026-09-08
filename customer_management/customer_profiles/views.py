from rest_framework.parsers import FormParser, MultiPartParser
from rest_framework.views import APIView

from common.permissions import IsCustomerRole
from common.response import success
from common.uploads import image_upload_error

from . import services
from .serializers import CustomerProfileSerializer


class CustomerProfileView(APIView):
    """GET/PUT the authenticated customer's own profile."""

    permission_classes = [IsCustomerRole]

    def get(self, request):
        profile = services.get_or_create_profile(request.user)
        serializer = CustomerProfileSerializer(profile, context={"request": request})
        return success(serializer.data)

    def put(self, request):
        profile = services.get_or_create_profile(request.user)
        serializer = CustomerProfileSerializer(
            profile, data=request.data, partial=True, context={"request": request}
        )
        serializer.is_valid(raise_exception=True)
        services.update_profile(profile, serializer)
        return success(serializer.data, message="Profile updated.")


class CustomerProfileImageUploadView(APIView):
    """POST a new profile (avatar) image."""

    permission_classes = [IsCustomerRole]
    parser_classes = [MultiPartParser, FormParser]

    def post(self, request):
        profile = services.get_or_create_profile(request.user)
        file = request.FILES.get("image") or request.FILES.get("avatar")
        upload_error = image_upload_error(file)
        if upload_error:
            return upload_error

        services.set_profile_image(profile, file)
        serializer = CustomerProfileSerializer(profile, context={"request": request})
        return success(serializer.data, message="Profile image updated.")


class CustomerCoverImageUploadView(APIView):
    """POST a new cover image."""

    permission_classes = [IsCustomerRole]
    parser_classes = [MultiPartParser, FormParser]

    def post(self, request):
        profile = services.get_or_create_profile(request.user)
        file = request.FILES.get("image") or request.FILES.get("cover")
        upload_error = image_upload_error(file)
        if upload_error:
            return upload_error

        services.set_cover_image(profile, file)
        serializer = CustomerProfileSerializer(profile, context={"request": request})
        return success(serializer.data, message="Cover image updated.")
