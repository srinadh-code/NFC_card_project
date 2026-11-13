"""Explicit offline settings for security regression tests.

Run: python manage.py test --settings=config.security_test_settings
This module never loads .env and never selects the working database.
"""

import os
from unittest.mock import patch

# Set before importing application settings, which configure external SDKs.
os.environ.update({
    "DJANGO_ENV": "development",
    "DEBUG": "True",
    "SECRET_KEY": "offline-security-tests-only-" + "x" * 50,
    "DATABASE_URL": "",
    "RENDER": "False",
    "RENDER_EXTERNAL_HOSTNAME": "",
    "FRONTEND_URL": "http://localhost:5173",
    "CLOUDINARY_URL": "",
    "CLOUDINARY_CLOUD_NAME": "",
    "CLOUDINARY_API_KEY": "",
    "CLOUDINARY_API_SECRET": "",
    "BREVO_API_KEY": "",
    "EMAIL_HOST": "",
    "RAZORPAY_KEY_ID": "",
    "RAZORPAY_KEY_SECRET": "",
    "RAZORPAY_WEBHOOK_SECRET": "",
    "MSG91_AUTH_KEY": "",
    "MSG91_OTP_TEMPLATE_ID": "",
    "GOOGLE_OAUTH_CLIENT_ID": "",
    "GOOGLE_OAUTH_CLIENT_SECRET": "",
    "DUMMY_PAYMENTS_ENABLED": "True",
    "PUBLIC_REGISTRATION_ENABLED": "False",
})

with patch("dotenv.load_dotenv", return_value=False):
    from .settings import *  # noqa: F403

DATABASES = {"default": {"ENGINE": "django.db.backends.sqlite3", "NAME": ":memory:"}}
ALLOWED_HOSTS = ["testserver", "localhost", "127.0.0.1"]
EMAIL_BACKEND = "django.core.mail.backends.locmem.EmailBackend"
STORAGES = {
    "default": {"BACKEND": "django.core.files.storage.InMemoryStorage"},
    "staticfiles": {"BACKEND": "django.contrib.staticfiles.storage.StaticFilesStorage"},
}
CACHES = {"default": {"BACKEND": "django.core.cache.backends.locmem.LocMemCache"}}
# Fast but still hashed passwords; these settings are never used by runserver.
PASSWORD_HASHERS = ["django.contrib.auth.hashers.MD5PasswordHasher"]
TEST_RUNNER = "common.security_test_runner.OfflineSecurityTestRunner"
