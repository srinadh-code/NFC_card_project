from rest_framework import serializers

from reports.models import GeneratedReport


class GeneratedReportSerializer(serializers.ModelSerializer):
    generated_by_name = serializers.SerializerMethodField()

    class Meta:
        model = GeneratedReport
        fields = ["id", "report_type", "generated_by_name", "row_count", "created_at"]
        read_only_fields = fields

    def get_generated_by_name(self, obj):
        if obj.generated_by_id:
            return obj.generated_by.full_name
        return obj.generated_by_name


class GeneratedReportCreateSerializer(serializers.Serializer):
    report_type = serializers.ChoiceField(choices=GeneratedReport.ReportType.choices)
    row_count = serializers.IntegerField(min_value=0, required=False, default=0)
