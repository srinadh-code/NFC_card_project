import csv
import io
from datetime import timedelta

from django.db.models import Q
from django.http import Http404
from django.shortcuts import get_object_or_404
from django.utils import timezone

from profiles.models import Profile
from common.csv_export import safe_csv_cell

from .models import Lead

#: A repeat of the exact same enquiry within this window (double-click,
#: retry after a slow response) returns the lead already saved instead of
#: creating a second one, so the owner's Leads count only moves once.
DUPLICATE_WINDOW_SECONDS = 120


def submit_lead(data):
    """Returns (lead, created)."""
    data = dict(data)
    username = data.pop("username")
    profile = Profile.objects.filter(username__iexact=username).select_related("user").first()
    # Same availability rule as the public profile page: an enquiry can only
    # be sent to a profile a visitor could actually see.
    if profile is None or not profile.profile_public or profile.status != Profile.Status.ACTIVE:
        raise Http404("This profile is not available.")
    duplicate = Lead.objects.filter(
        user=profile.user,
        name=data["name"],
        email__iexact=data["email"],
        phone=data["phone"],
        message=data["message"],
        created_at__gte=timezone.now() - timedelta(seconds=DUPLICATE_WINDOW_SECONDS),
    ).first()
    if duplicate is not None:
        return duplicate, False
    return Lead.objects.create(user=profile.user, **data), True


def update_lead_status(user, lead_id, status):
    # Filtered by owner, so another customer's lead id is a 404, not a 403.
    lead = get_object_or_404(Lead, pk=lead_id, user=user)
    lead.status = status
    lead.save(update_fields=["status"])
    return lead


def list_leads(user, search="", status=""):
    queryset = Lead.objects.filter(user=user)
    if status in Lead.Status.values:
        queryset = queryset.filter(status=status)
    if search:
        queryset = queryset.filter(
            Q(name__icontains=search)
            | Q(email__icontains=search)
            | Q(phone__icontains=search)
            | Q(company__icontains=search)
        )
    return queryset


def leads_csv(user):
    buffer = io.StringIO()
    writer = csv.writer(buffer)
    writer.writerow(["Name", "Email", "Phone", "Company", "Message", "Status", "Date"])
    for lead in list_leads(user):
        writer.writerow(
            [safe_csv_cell(value) for value in [
                lead.name,
                lead.email,
                lead.phone,
                lead.company,
                lead.message,
                lead.get_status_display(),
                lead.created_at.strftime("%Y-%m-%d %H:%M"),
            ]]
        )
    return buffer.getvalue()
