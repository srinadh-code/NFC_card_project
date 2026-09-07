# Single entry point real endpoints call to log a genuine engagement event.
# See nfc_cards.views.CardResolveView / TrackEventView and
# profiles.views.PublicProfileView for the only callers — never called with
# synthetic/backfilled data.
import hashlib

from django.conf import settings
from django.utils import timezone

from .models import TapEvent


def _device_from_user_agent(user_agent: str) -> str:
    ua = (user_agent or "").lower()
    if "android" in ua:
        return TapEvent.Device.ANDROID
    if "iphone" in ua or "ipad" in ua or "ipod" in ua:
        return TapEvent.Device.IOS
    return TapEvent.Device.OTHER


def _visitor_hash(request) -> str:
    """Irreversible, privacy-preserving stand-in for "who is this" — never
    stores the raw IP. Salted per-day so the same visitor hashes
    differently tomorrow, which is enough to approximate unique-visitor
    counts within a reporting window without retaining identifying data."""
    ip = request.META.get("REMOTE_ADDR", "")
    user_agent = request.META.get("HTTP_USER_AGENT", "")
    day_salt = timezone.now().strftime("%Y-%m-%d")
    raw = f"{ip}|{user_agent}|{day_salt}|{settings.SECRET_KEY}"
    return hashlib.sha256(raw.encode()).hexdigest()


def log_event(request, action, card=None, customer=None):
    return TapEvent.objects.create(
        card=card,
        customer=customer,
        action=action,
        device=_device_from_user_agent(request.META.get("HTTP_USER_AGENT", "")),
        visitor_hash=_visitor_hash(request),
    )
