from importlib import import_module
from io import StringIO
from types import SimpleNamespace

from django.apps import apps
from django.core.management import call_command
from django.db import connection
from django.test import TestCase

from website_content.models import Company


class CompanyPublicationSafetyTests(TestCase):
    def test_review_migration_preserves_records_and_assets_while_hiding_names(self):
        Company.objects.create(
            name="Fixture Team A", display_order=7, is_active=True,
            logo_url="https://example.com/fixture.svg", logo_public_id="fixture/keep",
        )
        Company.objects.create(name="Fixture Team B", display_order=4, is_active=False)
        fields = ("id", "name", "display_order", "logo_url", "logo_public_id")
        before = list(Company.objects.order_by("id").values_list(*fields))
        migration = import_module("website_content.migrations.0021_company_publication_review")
        migration.unpublish_until_reviewed(apps, SimpleNamespace(connection=connection))
        self.assertFalse(Company.objects.filter(is_active=True).exists())
        self.assertEqual(list(Company.objects.order_by("id").values_list(*fields)), before)
        self.assertEqual(Company.objects.count(), 2)

    def test_new_model_records_start_hidden(self):
        company = Company.objects.create(name="Fixture Awaiting Review")
        self.assertFalse(company.is_active)

    def test_repeated_seed_never_invents_or_overwrites_company_relationships(self):
        Company.objects.create(name="Fixture Verified Team", display_order=2, is_active=True)
        before = list(Company.objects.values())
        for _ in range(2):
            call_command("seed_website_content", stdout=StringIO())
        self.assertEqual(list(Company.objects.values()), before)
