import io
import logging

import qrcode
from django.conf import settings
from django.core.files.base import ContentFile

from profiles.models import Profile

from .models import CustomerQrCode

logger = logging.getLogger("customer_qr_codes")


def _build_png(target_url):
    image = qrcode.make(target_url)
    buffer = io.BytesIO()
    image.save(buffer, format="PNG")
    buffer.seek(0)
    return ContentFile(buffer.read(), name="qr.png")


def _target_url(profile):
    """The public profile's real, scannable destination — always the
    *frontend* origin (settings.FRONTEND_URL, the same one CORS is already
    configured from), never wherever this API request itself happened to
    arrive from. request.build_absolute_uri() was the bug here: an API call
    to Django always resolves to Django's own host
    (http://localhost:8000 in dev), which has no /u/<username> route at all
    — only the React app does. `src=qr` is preserved so a scan is still
    distinguishable from a plain profile visit (see analytics/tracking.py's
    QR_SCAN action, gated on this exact query param)."""
    base = settings.FRONTEND_URL.rstrip("/")
    if settings.DJANGO_ENV == "production" and (not base.startswith("https://") or "localhost" in base):
        # A QR pointing here can't be opened from a phone — FRONTEND_URL on
        # the server must be the public https:// site address.
        logger.error("qr.frontend_url_not_public — set FRONTEND_URL to the https:// site URL")
    return f"{base}{profile.public_url_path}?src=qr"


def _rebuild(qr, target_url):
    if qr.image:
        qr.image.delete(save=False)
    qr.target_url = target_url
    qr.image.save("qr.png", _build_png(target_url), save=True)
    return qr


def _refresh_if_stale(qr, profile):
    """A stored QR keeps whatever URL it was first built with — so one made
    before FRONTEND_URL was set correctly, or before a username change,
    would scan to the wrong address forever. Rebuild it whenever its URL no
    longer matches; otherwise leave the stored image untouched."""
    target_url = _target_url(profile)
    if qr.target_url != target_url:
        _rebuild(qr, target_url)
    return qr


def get_qr_code(user):
    profile = Profile.ensure_for_user(user)
    qr = CustomerQrCode.objects.filter(profile=profile).first()
    return _refresh_if_stale(qr, profile) if qr else None


def generate_qr_code(user):
    """Returns the existing QR code if one already exists, otherwise creates it."""
    profile = Profile.ensure_for_user(user)
    existing = CustomerQrCode.objects.filter(profile=profile).first()
    if existing:
        return _refresh_if_stale(existing, profile), False

    target_url = _target_url(profile)
    qr = CustomerQrCode(profile=profile, target_url=target_url)
    qr.image.save("qr.png", _build_png(target_url), save=True)
    return qr, True


def regenerate_qr_code(user):
    """Always rebuilds the QR image (e.g. after a username change), replacing the old file."""
    profile = Profile.ensure_for_user(user)
    target_url = _target_url(profile)

    qr, _created = CustomerQrCode.objects.get_or_create(
        profile=profile, defaults={"target_url": target_url}
    )
    return _rebuild(qr, target_url)
