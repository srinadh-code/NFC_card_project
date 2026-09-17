import io

import qrcode
from django.conf import settings
from django.core.files.base import ContentFile

from profiles.models import Profile

from .models import CustomerQrCode


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
    return f"{settings.FRONTEND_URL}{profile.public_url_path}?src=qr"


def get_qr_code(user):
    profile = Profile.ensure_for_user(user)
    return CustomerQrCode.objects.filter(profile=profile).first()


def generate_qr_code(user):
    """Returns the existing QR code if one already exists, otherwise creates it."""
    profile = Profile.ensure_for_user(user)
    existing = CustomerQrCode.objects.filter(profile=profile).first()
    if existing:
        return existing, False

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
    if qr.image:
        qr.image.delete(save=False)

    qr.target_url = target_url
    qr.image.save("qr.png", _build_png(target_url), save=True)
    return qr
