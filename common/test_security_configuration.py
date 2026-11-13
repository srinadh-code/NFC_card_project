"""Production startup probes that never connect to a database/provider."""

import os
import subprocess
import sys

from django.test import SimpleTestCase


class ProductionConfigurationSecurityTests(SimpleTestCase):
    def _startup_rejects(self, *, secret, debug, reject=True):
        env = dict(os.environ)
        env.update({
            "DJANGO_ENV": "production",
            "DEBUG": debug,
            "DATABASE_URL": "postgresql://offline:offline@127.0.0.1/offline",
        })
        if secret is None:
            env.pop("SECRET_KEY", None)
        else:
            env["SECRET_KEY"] = secret
        # .env is explicitly disabled in the subprocess as in the test
        # settings. Importing settings does not open a DB connection.
        code = (
            "from unittest.mock import patch\n"
            "from django.core.exceptions import ImproperlyConfigured\n"
            "try:\n"
            "    with patch('dotenv.load_dotenv', return_value=False):\n"
            "        import config.settings\n"
            "except ImproperlyConfigured:\n"
            "    raise SystemExit(0)\n"
            "raise SystemExit(1)\n"
        )
        completed = subprocess.run(
            [sys.executable, "-c", code], env=env, capture_output=True, timeout=20,
        )
        self.assertEqual(completed.returncode, 0 if reject else 1, "Unexpected production startup validation result.")

    def test_production_rejects_missing_secret(self):
        self._startup_rejects(secret=None, debug="False")

    def test_production_rejects_debug_enabled(self):
        self._startup_rejects(secret="offline-configuration-probe-" + "x" * 50, debug="True")

    def test_production_accepts_private_secret_and_debug_disabled(self):
        self._startup_rejects(secret="offline-configuration-probe-" + "x" * 50, debug="False", reject=False)
