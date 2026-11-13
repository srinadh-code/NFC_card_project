import csv
import io

from common.test_utils import AuthenticatedAPITestCase
from .models import Lead
from .services import leads_csv


class LeadExportSecurityTests(AuthenticatedAPITestCase):
    def test_untrusted_formula_cells_are_neutralized(self):
        for value in ['=HYPERLINK("https://evil.example")', "+SUM(1,2)", "-1+2", "@SUM(1,2)", "\t=1+2", "\r=1+2", "  =1+2"]:
            with self.subTest(value=value):
                Lead.objects.all().delete()
                Lead.objects.create(user=self.user, name=value, email="lead@example.com", company=value, message=value)
                row = list(csv.reader(io.StringIO(leads_csv(self.user))))[1]
                for index in (0, 3, 4):
                    self.assertEqual(row[index], "'" + value)

    def test_normal_text_and_other_users_are_unchanged(self):
        Lead.objects.create(user=self.user, name='Alice, "Founder"', email="alice@example.com")
        Lead.objects.create(user=self.other_user, name="Private other", email="other@example.com")
        rows = list(csv.reader(io.StringIO(leads_csv(self.user))))
        self.assertEqual(len(rows), 2)
        self.assertEqual(rows[1][0], 'Alice, "Founder"')
