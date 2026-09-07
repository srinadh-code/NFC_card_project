import csv
import io

from django.db.models import Q
from django.shortcuts import get_object_or_404

from profiles.models import Profile

from .models import Lead


def submit_lead(data):
    data = dict(data)
    username = data.pop("username")
    profile = get_object_or_404(Profile, username__iexact=username)
    return Lead.objects.create(user=profile.user, **data)


def list_leads(user, search=""):
    queryset = Lead.objects.filter(user=user)
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
    writer.writerow(["Name", "Email", "Phone", "Company", "Message", "Date"])
    for lead in list_leads(user):
        writer.writerow(
            [
                lead.name,
                lead.email,
                lead.phone,
                lead.company,
                lead.message,
                lead.created_at.strftime("%Y-%m-%d %H:%M"),
            ]
        )
    return buffer.getvalue()
