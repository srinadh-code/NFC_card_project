from rest_framework import serializers


class AnalyticsSummarySerializer(serializers.Serializer):
    """Plain output shape (not backed by a model) for the aggregated
    analytics the frontend's Analytics/Dashboard/Reports pages chart —
    every number here comes from a real TapEvent aggregate for the
    requested range, never a placeholder."""

    range_days = serializers.IntegerField()
    total_taps = serializers.IntegerField()
    qr_scans = serializers.IntegerField()
    profile_views = serializers.IntegerField()
    contact_saves = serializers.IntegerField()
    shares = serializers.IntegerField()
    unique_visitors = serializers.IntegerField()
    by_day = serializers.ListField()
    by_device = serializers.ListField()
    top_locations = serializers.ListField()
