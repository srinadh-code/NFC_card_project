from rest_framework import serializers

from customer_management.customer_analytics.serializers import AnalyticsEventSerializer
from customer_management.customer_notifications.serializers import NotificationSerializer
from nfc_cards.serializers import NfcCardSerializer


class DashboardTotalsSerializer(serializers.Serializer):
    profile_views = serializers.IntegerField()
    nfc_taps = serializers.IntegerField()
    qr_scans = serializers.IntegerField()
    leads = serializers.IntegerField()
    orders = serializers.IntegerField()


class CustomerDashboardSerializer(serializers.Serializer):
    totals = DashboardTotalsSerializer()
    nfc_cards = NfcCardSerializer(many=True)
    recent_notifications = NotificationSerializer(many=True)
    recent_activity = AnalyticsEventSerializer(many=True)
