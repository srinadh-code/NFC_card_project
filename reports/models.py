from django.conf import settings
from django.db import models


class GeneratedReport(models.Model):
    """One row per admin-generated report. Written by the admin UI right
    after it successfully builds and downloads a report from the live data
    endpoints in admin_api/reports — this table is the real, persisted
    "Recent Reports" history, not a client-only mock."""

    class ReportType(models.TextChoices):
        SALES = "SALES", "Sales Report"
        TAP_ANALYTICS = "TAP_ANALYTICS", "Tap Analytics"
        CUSTOMERS = "CUSTOMERS", "Customer Report"
        ORDERS = "ORDERS", "Order Report"

    report_type = models.CharField(max_length=20, choices=ReportType.choices)
    generated_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, related_name="generated_reports"
    )
    # Snapshot, same rationale as OrderItem's product snapshot fields — the
    # history entry must keep reading correctly even if the admin account
    # that generated it is later deleted.
    generated_by_name = models.CharField(max_length=150, blank=True, default="")
    row_count = models.PositiveIntegerField(default=0)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at"]

    def __str__(self):
        return f"{self.get_report_type_display()} ({self.created_at:%Y-%m-%d})"
