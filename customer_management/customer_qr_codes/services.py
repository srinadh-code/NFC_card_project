import io

import qrcode
from django.core.files.base import ContentFile

from profiles.models import Profile

from .models import CustomerQrCode


def _build_png(target_url):
    image = qrcode.make(target_url)
    buffer = io.BytesIO()
    image.save(buffer, format="PNG")
    buffer.seek(0)
    return ContentFile(buffer.read(), name="qr.png")


def _target_url(profile, request):
    path = f"{profile.public_url_path}?src=qr"
    return request.build_absolute_uri(path) if request else path


def get_qr_code(user):
    profile = Profile.ensure_for_user(user)
    return CustomerQrCode.objects.filter(profile=profile).first()


def generate_qr_code(user, request):
    """Returns the existing QR code if one already exists, otherwise creates it."""
    profile = Profile.ensure_for_user(user)
    existing = CustomerQrCode.objects.filter(profile=profile).first()
    if existing:
        return existing, False

    target_url = _target_url(profile, request)
    qr = CustomerQrCode(profile=profile, target_url=target_url)
    qr.image.save("qr.png", _build_png(target_url), save=True)
    return qr, True


def regenerate_qr_code(user, request):
    """Always rebuilds the QR image (e.g. after a username change), replacing the old file."""
    profile = Profile.ensure_for_user(user)
    target_url = _target_url(profile, request)

    qr, _created = CustomerQrCode.objects.get_or_create(
        profile=profile, defaults={"target_url": target_url}
    )
    if qr.image:
        qr.image.delete(save=False)

    qr.target_url = target_url
    qr.image.save("qr.png", _build_png(target_url), save=True)
    return qr
