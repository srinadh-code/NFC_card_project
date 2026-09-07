from rest_framework import serializers

from .models import CustomerQrCode


class CustomerQrCodeSerializer(serializers.ModelSerializer):
    image = serializers.SerializerMethodField()

    class Meta:
        model = CustomerQrCode
        fields = ["id", "image", "target_url", "created_at", "updated_at"]
        read_only_fields = fields

    def get_image(self, obj):
        if not obj.image:
            return None
        request = self.context.get("request")
        url = obj.image.url
        return request.build_absolute_uri(url) if request else url
