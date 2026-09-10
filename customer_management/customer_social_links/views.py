from rest_framework.views import APIView

from common.permissions import IsCustomerRole
from common.response import success
from profiles.serializers import SocialLinkSerializer

from . import services
from .serializers import CustomerSocialLinksUpdateSerializer


class CustomerSocialLinksView(APIView):
    permission_classes = [IsCustomerRole]

    def get(self, request):
        links = services.get_social_links(request.user)
        return success(SocialLinkSerializer(links, many=True).data)

    def put(self, request):
        serializer = CustomerSocialLinksUpdateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        links = services.replace_social_links(request.user, serializer.validated_data["links"])
        return success(SocialLinkSerializer(links, many=True).data, message="Social links updated.")
