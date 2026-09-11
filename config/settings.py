"""
Django settings for the VR's NEXORA backend (config project).
"""

from datetime import timedelta
from pathlib import Path

import dj_database_url
from dotenv import load_dotenv
import os

BASE_DIR = Path(__file__).resolve().parent.parent

load_dotenv(BASE_DIR / ".env")


def env_bool(name, default=False):
    value = os.environ.get(name)
    if value is None:
        return default
    return value.strip().lower() in ("1", "true", "yes", "on")


def env_list(name, default=""):
    value = os.environ.get(name, default)
    return [item.strip() for item in value.split(",") if item.strip()]


# SECURITY WARNING: keep the secret key used in production secret!
SECRET_KEY = os.environ.get(
    "SECRET_KEY", "django-insecure--5t1b582c4!97$illa@xo47um5p^)of%tx05z+=h6elp2v_wgz"
)

DEBUG = env_bool("DEBUG", True)

ALLOWED_HOSTS = env_list("ALLOWED_HOSTS", "localhost,127.0.0.1")

# Render injects this automatically for every web service (just the
# hostname, no scheme) — trusting it means ALLOWED_HOSTS doesn't need to be
# hand-maintained with the service's *.onrender.com domain.
RENDER_EXTERNAL_HOSTNAME = os.environ.get("RENDER_EXTERNAL_HOSTNAME", "").strip()
if RENDER_EXTERNAL_HOSTNAME and RENDER_EXTERNAL_HOSTNAME not in ALLOWED_HOSTS:
    ALLOWED_HOSTS.append(RENDER_EXTERNAL_HOSTNAME)


# Application definition

INSTALLED_APPS = [
    "django.contrib.admin",
    "django.contrib.auth",
    "django.contrib.contenttypes",
    "django.contrib.sessions",
    "django.contrib.messages",
    "django.contrib.staticfiles",
    "rest_framework",
    "rest_framework_simplejwt",
    "rest_framework_simplejwt.token_blacklist",
    "corsheaders",
    "accounts",
    "profiles",
    "nfc_cards",
    "orders",
    "support",
    "analytics",
    "admin_api",
    "customer_management.customer_profiles",
    "customer_management.customer_social_links",
    "customer_management.customer_qr_codes",
    "customer_management.customer_analytics",
    "customer_management.customer_orders",
    "customer_management.customer_leads",
    "customer_management.customer_notifications",
    "customer_management.customer_settings",
    "customer_management.customer_dashboard",
    "customer_management.customer_services",
    "website_content",
]

MIDDLEWARE = [
    "django.middleware.security.SecurityMiddleware",
    # Must sit directly after SecurityMiddleware, before everything else —
    # serves STATIC_ROOT straight out of the app process, so Render's Web
    # Service (no separate static file host) can serve /static/ itself.
    "whitenoise.middleware.WhiteNoiseMiddleware",
    "corsheaders.middleware.CorsMiddleware",
    "django.contrib.sessions.middleware.SessionMiddleware",
    "django.middleware.common.CommonMiddleware",
    "django.middleware.csrf.CsrfViewMiddleware",
    "django.contrib.auth.middleware.AuthenticationMiddleware",
    "django.contrib.messages.middleware.MessageMiddleware",
    "django.middleware.clickjacking.XFrameOptionsMiddleware",
]

ROOT_URLCONF = "config.urls"

TEMPLATES = [
    {
        "BACKEND": "django.template.backends.django.DjangoTemplates",
        "DIRS": [],
        "APP_DIRS": True,
        "OPTIONS": {
            "context_processors": [
                "django.template.context_processors.request",
                "django.contrib.auth.context_processors.auth",
                "django.contrib.messages.context_processors.messages",
            ],
        },
    },
]

WSGI_APPLICATION = "config.wsgi.application"


# Database
# SQLite by default for local dev; set DATABASE_URL (e.g. a postgres:// URL)
# to point at Postgres in staging/production. No code changes needed.
DATABASE_URL = os.environ.get("DATABASE_URL", "").strip()

if DATABASE_URL:
    DATABASES = {
        "default": dj_database_url.parse(
            DATABASE_URL, conn_max_age=600, conn_health_checks=True
        )
    }
else:
    DATABASES = {
        "default": {
            "ENGINE": "django.db.backends.sqlite3",
            "NAME": BASE_DIR / "db.sqlite3",
        }
    }


AUTH_USER_MODEL = "accounts.User"


# Password validation
#
# One policy for every flow that sets a password (register, reset, change) —
# they all run through validate_password() in accounts/serializers.py, so the
# rules are declared here once rather than per endpoint. The signup form's
# live checklist mirrors these rules for feedback only; this list is what
# actually decides. Effective policy: 8-12 characters, with at least one
# lowercase letter, one uppercase letter, one number and one special
# character, and not a common or wholly numeric password.
AUTH_PASSWORD_VALIDATORS = [
    {"NAME": "django.contrib.auth.password_validation.UserAttributeSimilarityValidator"},
    {
        "NAME": "django.contrib.auth.password_validation.MinimumLengthValidator",
        "OPTIONS": {"min_length": 8},
    },
    {"NAME": "django.contrib.auth.password_validation.CommonPasswordValidator"},
    {"NAME": "django.contrib.auth.password_validation.NumericPasswordValidator"},
    {"NAME": "accounts.validators.PasswordComplexityValidator"},
]


# Internationalization
LANGUAGE_CODE = "en-us"
TIME_ZONE = "UTC"
USE_I18N = True
USE_TZ = True


# Static & media files
STATIC_URL = "static/"
STATIC_ROOT = BASE_DIR / "staticfiles"

MEDIA_URL = "/media/"
MEDIA_ROOT = BASE_DIR / "media"

# Render's web service disk is ephemeral — anything written to MEDIA_ROOT
# (profile avatars, cover images, generated QR codes) is wiped on every
# deploy/restart. Setting Cloudinary credentials switches customer-uploaded
# media to Cloudinary (persistent, CDN-backed) with no other code changes:
# every ImageField already reads its .url through request.build_absolute_uri()
# (see profiles/serializers.py, customer_profiles/serializers.py,
# customer_qr_codes/serializers.py) — that call is a no-op passthrough for an
# already-absolute Cloudinary URL and only adds a scheme+host for a relative
# local path, so the exact same serializer code is correct for both storage
# backends. Leave both unset for local dev, or for a Render deployment that
# accepts losing uploads on every deploy.
#
# Two ways to configure it — set whichever is easier to get from the
# Cloudinary dashboard:
#   1. CLOUDINARY_URL alone, e.g. cloudinary://<api_key>:<api_secret>@<cloud_name>
#      (the single string Cloudinary's own dashboard gives you)
#   2. CLOUDINARY_CLOUD_NAME + CLOUDINARY_API_KEY + CLOUDINARY_API_SECRET
#      separately — combined into the same URL form internally.
CLOUDINARY_URL = os.environ.get("CLOUDINARY_URL", "").strip()
if not CLOUDINARY_URL:
    _cloud_name = os.environ.get("CLOUDINARY_CLOUD_NAME", "").strip()
    _api_key = os.environ.get("CLOUDINARY_API_KEY", "").strip()
    _api_secret = os.environ.get("CLOUDINARY_API_SECRET", "").strip()
    if _cloud_name and _api_key and _api_secret:
        CLOUDINARY_URL = f"cloudinary://{_api_key}:{_api_secret}@{_cloud_name}"
        # cloudinary's SDK reads this env var directly (not just the Django
        # setting above) the moment it's imported, so it must actually be
        # set here too — not only assigned to a Django setting.
        os.environ["CLOUDINARY_URL"] = CLOUDINARY_URL

MEDIA_USES_CLOUD_STORAGE = bool(CLOUDINARY_URL)

if MEDIA_USES_CLOUD_STORAGE:
    INSTALLED_APPS += ["cloudinary_storage", "cloudinary"]

STORAGES = {
    "default": {
        "BACKEND": (
            "cloudinary_storage.storage.MediaCloudinaryStorage"
            if MEDIA_USES_CLOUD_STORAGE
            else "django.core.files.storage.FileSystemStorage"
        ),
    },
    "staticfiles": {
        "BACKEND": "whitenoise.storage.CompressedManifestStaticFilesStorage",
    },
}

DEFAULT_AUTO_FIELD = "django.db.models.BigAutoField"


# Email
# Leave EMAIL_HOST unset to fall back to the console backend (prints emails
# to the server log/terminal) — the default for local development.
EMAIL_HOST = os.environ.get("EMAIL_HOST", "").strip()

if EMAIL_HOST:
    EMAIL_BACKEND = "django.core.mail.backends.smtp.EmailBackend"
    EMAIL_PORT = int(os.environ.get("EMAIL_PORT", "587"))
    EMAIL_HOST_USER = os.environ.get("EMAIL_HOST_USER", "")
    EMAIL_HOST_PASSWORD = os.environ.get("EMAIL_HOST_PASSWORD", "")
    EMAIL_USE_TLS = env_bool("EMAIL_USE_TLS", True)
else:
    EMAIL_BACKEND = "django.core.mail.backends.console.EmailBackend"

DEFAULT_FROM_EMAIL = os.environ.get("DEFAULT_FROM_EMAIL", "no-reply@vrsnexora.com")


# Frontend / CORS
# Frontend and backend are separate deployments (React on Vercel/Netlify/a
# Render static site, Django on a Render web service) — every origin the
# frontend can actually be served from must be listed explicitly here.
# Wildcards are deliberately never used in either list below.
FRONTEND_URL = os.environ.get("FRONTEND_URL", "http://localhost:5173")
CORS_ALLOWED_ORIGINS = env_list("CORS_ALLOWED_ORIGINS", FRONTEND_URL)
CORS_ALLOW_CREDENTIALS = True

# CSRF only actually matters for the session-authenticated Django admin
# site (/admin/) — every DRF API view here is JWT-authenticated and
# CSRF-exempt by design (DRF marks APIView.as_view() csrf_exempt so
# token-based clients never need a CSRF token). It still needs the
# backend's own public origin trusted, since Django 4+ checks the admin
# login POST's Origin header against this list, and that origin only
# matches automatically when the request looks same-origin over plain
# HTTP — which it never does once Render's proxy terminates TLS in front
# of the app.
_csrf_trusted = env_list("CSRF_TRUSTED_ORIGINS", "")
if not _csrf_trusted:
    _csrf_trusted = list(CORS_ALLOWED_ORIGINS)
if RENDER_EXTERNAL_HOSTNAME:
    _csrf_trusted.append(f"https://{RENDER_EXTERNAL_HOSTNAME}")
CSRF_TRUSTED_ORIGINS = list(dict.fromkeys(_csrf_trusted))  # de-dupe, keep order


# Google OAuth integration point (Phase A stub — see accounts/views.py GoogleLoginView).
GOOGLE_OAUTH_CLIENT_ID = os.environ.get("GOOGLE_OAUTH_CLIENT_ID", "")
GOOGLE_OAUTH_CLIENT_SECRET = os.environ.get("GOOGLE_OAUTH_CLIENT_SECRET", "")

# Brevo — sends the password-reset OTP by email via Brevo's HTTP API (see
# accounts/emails.py's send_password_reset_otp_email). Leave BREVO_API_KEY
# unset locally: that function logs a clear "not configured" warning and
# returns False rather than faking a successful send — the forgot-password
# response is identical either way, so this never affects account-
# enumeration behavior.
#
# Provider-independent by design: accounts/emails.py never sees a personal
# vs. company Brevo account, only these three settings. Swapping a
# development API key for the company's later (or replacing Brevo with a
# different provider's function entirely) is purely an environment/
# deployment change — no application code needs to change either way.
BREVO_API_KEY = os.environ.get("BREVO_API_KEY", "").strip()
BREVO_SENDER_EMAIL = os.environ.get("BREVO_SENDER_EMAIL", "").strip() or DEFAULT_FROM_EMAIL
BREVO_SENDER_NAME = os.environ.get("BREVO_SENDER_NAME", "").strip()


# Cloudinary — image storage for the Website Content module only. Credentials
# are read from the environment and never exposed to the frontend; uploads
# are always brokered through a Django APIView (see website_content/services).
CLOUDINARY_CLOUD_NAME = os.environ.get("CLOUDINARY_CLOUD_NAME", "")
CLOUDINARY_API_KEY = os.environ.get("CLOUDINARY_API_KEY", "")
CLOUDINARY_API_SECRET = os.environ.get("CLOUDINARY_API_SECRET", "")

if CLOUDINARY_CLOUD_NAME:
    import cloudinary

    cloudinary.config(
        cloud_name=CLOUDINARY_CLOUD_NAME,
        api_key=CLOUDINARY_API_KEY,
        api_secret=CLOUDINARY_API_SECRET,
        secure=True,
    )


# Django REST Framework
REST_FRAMEWORK = {
    "DEFAULT_AUTHENTICATION_CLASSES": (
        "rest_framework_simplejwt.authentication.JWTAuthentication",
    ),
    "DEFAULT_PERMISSION_CLASSES": ("rest_framework.permissions.IsAuthenticated",),
    "DEFAULT_PAGINATION_CLASS": "common.pagination.StandardPagination",
    "PAGE_SIZE": 10,
    "EXCEPTION_HANDLER": "common.response.custom_exception_handler",
    "DEFAULT_THROTTLE_RATES": {
        "otp": "5/min",
        "lead_submit": "10/min",
    },
}

SIMPLE_JWT = {
    "ACCESS_TOKEN_LIFETIME": timedelta(
        minutes=int(os.environ.get("ACCESS_TOKEN_LIFETIME_MINUTES", "30"))
    ),
    "REFRESH_TOKEN_LIFETIME": timedelta(
        days=int(os.environ.get("REFRESH_TOKEN_LIFETIME_DAYS", "7"))
    ),
    "ROTATE_REFRESH_TOKENS": True,
    "BLACKLIST_AFTER_ROTATION": True,
    "UPDATE_LAST_LOGIN": True,
    "USER_ID_FIELD": "id",
    "USER_ID_CLAIM": "user_id",
}


# Security hardening
# Render (like every PaaS load balancer) terminates TLS at its edge and
# forwards plain HTTP to the app with X-Forwarded-Proto set — without this,
# Django thinks every request is insecure, and SECURE_SSL_REDIRECT below
# would redirect-loop forever.
SECURE_PROXY_SSL_HEADER = ("HTTP_X_FORWARDED_PROTO", "https")
USE_X_FORWARDED_HOST = True

# All of the below are meaningless (and actively annoying) over plain HTTP
# in local dev, so they're only turned on for a real, non-DEBUG deployment.
# SECURE_SSL_REDIRECT can still be forced off in a DEBUG=False environment
# that isn't yet behind HTTPS (e.g. a first smoke-test deploy) via the env
# var, without touching code.
if not DEBUG:
    SECURE_SSL_REDIRECT = env_bool("SECURE_SSL_REDIRECT", True)
    SESSION_COOKIE_SECURE = True
    CSRF_COOKIE_SECURE = True
    SECURE_HSTS_SECONDS = int(os.environ.get("SECURE_HSTS_SECONDS", "31536000"))  # 1 year
    SECURE_HSTS_INCLUDE_SUBDOMAINS = True
    SECURE_HSTS_PRELOAD = True
else:
    SECURE_SSL_REDIRECT = False
    SESSION_COOKIE_SECURE = False
    CSRF_COOKIE_SECURE = False
    SECURE_HSTS_SECONDS = 0
    SECURE_HSTS_INCLUDE_SUBDOMAINS = False
    SECURE_HSTS_PRELOAD = False

# Always on, in every environment — cheap, no HTTPS dependency, no reason
# to ever disable them locally.
X_FRAME_OPTIONS = "DENY"
SECURE_CONTENT_TYPE_NOSNIFF = True
SECURE_REFERRER_POLICY = "same-origin"
# SECURE_BROWSER_XSS_FILTER is deliberately not set: Django dropped it
# (browsers themselves removed the X-XSS-Protection header it controlled),
# so setting it would be a dead, do-nothing line.


# Logging — Render captures stdout/stderr as the service's log stream, so
# everything just goes to the console instead of a log file the ephemeral
# disk would lose anyway.
LOGGING = {
    "version": 1,
    "disable_existing_loggers": False,
    "handlers": {
        "console": {"class": "logging.StreamHandler"},
    },
    "root": {
        "handlers": ["console"],
        "level": os.environ.get("DJANGO_LOG_LEVEL", "INFO"),
    },
    "loggers": {
        "django.request": {
            "handlers": ["console"],
            "level": "ERROR",
            "propagate": False,
        },
    },
}
