"""Map-based address entry: place search and "what address is at this pin".

Backs the address form's "Choose on Map" panel (search box autocomplete,
map click / marker drag, "Use My Current Location"). Only a convenience
for filling the form — the address the customer saves still goes through
CustomerAddressSerializer and pincode.verify_address like a typed one, so
a map-detected PIN or district that India Post disagrees with is caught
there, not trusted.

OSM's postcodes and place names don't always line up with India Post's
(rural pins often have no postcode; an OSM suburb can share its name with
another PIN's post office), so a detected address is reconciled with
India Post before it's returned — see _reconcile_with_india_post.

Data source: OpenStreetMap, no API key —
  * search: Photon (photon.komoot.io), which is built for search-as-you-type
    (Nominatim's usage policy forbids autocomplete against it);
  * reverse: Nominatim (nominatim.openstreetmap.org), max 1 request/second
    with an identifying User-Agent, so calls are spaced out per process
    and cached.
Endpoints are settings-overridable (GEOCODING_SEARCH_URL /
GEOCODING_REVERSE_URL) for a self-hosted or commercial instance.
"""

import hashlib
import logging
import re
import threading
import time
from dataclasses import asdict, dataclass, replace

import requests
from django.conf import settings
from django.core.cache import cache

from . import pincode as pincode_service

logger = logging.getLogger(__name__)

SEARCH_URL = getattr(settings, "GEOCODING_SEARCH_URL", "https://photon.komoot.io/api/")
REVERSE_URL = getattr(settings, "GEOCODING_REVERSE_URL", "https://nominatim.openstreetmap.org/reverse")
REQUEST_HEADERS = {"User-Agent": getattr(settings, "GEOCODING_USER_AGENT", "VRsGateway-AddressLookup/1.0")}
REQUEST_TIMEOUT_SECONDS = 8

# Deliveries are India-only; a rough bounding box keeps search results and
# saved pins inside it (the country check on reverse results is exact).
INDIA_BOUNDS = {"min_lat": 6.0, "max_lat": 37.6, "min_lng": 68.0, "max_lng": 97.5}

SEARCH_MIN_LENGTH = 3
SEARCH_MAX_LENGTH = 120
SEARCH_LIMIT = 6
SEARCH_CACHE_SECONDS = 60 * 60 * 24
REVERSE_CACHE_SECONDS = 60 * 60 * 24 * 30
SEARCH_CACHE_KEY = "geocode-search:v1:{digest}"
REVERSE_CACHE_KEY = "geocode-reverse:v1:{lat}:{lng}"

UNAVAILABLE_MESSAGE = "We couldn't look up this location right now. Please try again, or enter the address manually."
OUTSIDE_INDIA_MESSAGE = "We currently deliver only within India. Please choose a location in India."
NOT_FOUND_MESSAGE = "We couldn't find an address at this spot. Try moving the pin closer to a road or building."

PINCODE_RE = re.compile(r"\b([1-9]\d{5})\b")

# Nominatim's 1 request/second policy, enforced per process.
_reverse_lock = threading.Lock()
_last_reverse_call = 0.0
REVERSE_MIN_INTERVAL_SECONDS = 1.0


class GeocodingUnavailable(Exception):
    """The geocoding service couldn't be reached or answered unreadably."""


class OutsideServiceArea(Exception):
    """The point/place isn't in India."""


def in_india_bounds(lat, lng):
    b = INDIA_BOUNDS
    return b["min_lat"] <= lat <= b["max_lat"] and b["min_lng"] <= lng <= b["max_lng"]


@dataclass
class DetectedAddress:
    """The address-form fields a map pin resolves to. Any of them can be
    blank — the form only fills what was detected."""

    latitude: float
    longitude: float
    address_line1: str = ""
    address_line2: str = ""
    landmark: str = ""
    locality: str = ""
    city: str = ""
    district: str = ""
    state: str = ""
    pincode: str = ""
    country: str = "India"
    display_name: str = ""

    def as_dict(self):
        return asdict(self)


def _join(*parts):
    seen = []
    for part in parts:
        part = (part or "").strip()
        if part and part.lower() not in (p.lower() for p in seen):
            seen.append(part)
    return ", ".join(seen)


def _clean_district(name):
    # OSM tags some districts "Warangal Urban District"/"Mulugu district".
    return re.sub(r"\s+district$", "", (name or "").strip(), flags=re.IGNORECASE)


def _clean_pincode(value):
    match = PINCODE_RE.search(value or "")
    return match.group(1) if match else ""


def address_from_nominatim(data, lat, lng):
    """Map a Nominatim jsonv2 reverse result onto the address form's
    fields (Indian addressing: village/suburb -> locality, state_district
    -> district; mandal/tehsil "county" only as a city fallback)."""
    addr = data.get("address") or {}
    if (addr.get("country_code") or "").lower() != "in":
        raise OutsideServiceArea

    city = addr.get("city") or addr.get("town") or addr.get("municipality") or ""
    locality = (
        addr.get("village")
        or addr.get("hamlet")
        or addr.get("suburb")
        or addr.get("neighbourhood")
        or addr.get("quarter")
        or ""
    )
    if not city:
        # Rural pins: no city/town — the village is the best "city", and
        # the mandal/tehsil the next best.
        city = locality or re.sub(r"\s+(mandal|tehsil|taluk|taluka)$", "", addr.get("county") or "", flags=re.I)
    if locality.lower() == city.lower():
        locality = ""

    # A pin on a named place (shop, temple, school…) — offered as the
    # landmark rather than forced into the street line.
    name = (data.get("name") or "").strip()
    road = addr.get("road") or addr.get("pedestrian") or addr.get("residential") or ""
    is_place = data.get("category") not in (None, "highway", "place", "boundary", "landuse") and name
    landmark = name if is_place and name.lower() != road.lower() else ""

    line1 = _join(addr.get("house_number"), addr.get("house_name") or addr.get("building"), road)
    line2_parts = [addr.get("neighbourhood"), addr.get("suburb"), addr.get("quarter")]
    line2 = _join(*(p for p in line2_parts if p and p.lower() not in {locality.lower(), city.lower()}))
    if not line1:
        # Nothing street-level — fall back to the area so Address Line 1
        # isn't blank (the customer still adds their house number).
        line1, line2 = line2, ""

    return DetectedAddress(
        latitude=lat,
        longitude=lng,
        address_line1=line1[:255],
        address_line2=line2[:255],
        landmark=landmark[:100],
        locality=locality[:100],
        city=city[:100],
        district=_clean_district(addr.get("state_district") or addr.get("county") or "")[:100],
        state=(addr.get("state") or "")[:100],
        pincode=_clean_pincode(addr.get("postcode")),
        country="India",
        display_name=data.get("display_name") or "",
    )


def _get_json(url, params, label):
    try:
        response = requests.get(url, params=params, headers=REQUEST_HEADERS, timeout=REQUEST_TIMEOUT_SECONDS)
        response.raise_for_status()
        return response.json()
    except (requests.RequestException, ValueError) as exc:
        logger.warning("Geocoding request failed for %s: %s", label, exc)
        raise GeocodingUnavailable from exc


def _fetch_reverse(lat, lng):
    """Raw Nominatim reverse result. Raises GeocodingUnavailable."""
    global _last_reverse_call
    with _reverse_lock:
        wait = REVERSE_MIN_INTERVAL_SECONDS - (time.monotonic() - _last_reverse_call)
        if wait > 0:
            time.sleep(wait)
        try:
            return _get_json(
                REVERSE_URL,
                {"lat": lat, "lon": lng, "format": "jsonv2", "addressdetails": 1, "zoom": 18, "accept-language": "en"},
                f"reverse {lat},{lng}",
            )
        finally:
            _last_reverse_call = time.monotonic()


def _fetch_search(query, bias):
    """Raw Photon GeoJSON features. Raises GeocodingUnavailable."""
    b = INDIA_BOUNDS
    params = {
        "q": query,
        "limit": SEARCH_LIMIT * 2,  # some are dropped by the country filter
        "lang": "en",
        "bbox": f"{b['min_lng']},{b['min_lat']},{b['max_lng']},{b['max_lat']}",
    }
    if bias:
        params["lat"], params["lon"] = bias
    data = _get_json(SEARCH_URL, params, f"search {query!r}")
    if not isinstance(data, dict) or not isinstance(data.get("features"), list):
        logger.warning("Unexpected geocoding search response for %r: %r", query, data)
        raise GeocodingUnavailable
    return data["features"]


def reverse_geocode(lat, lng):
    """DetectedAddress for a pin. Raises OutsideServiceArea (not in India),
    LookupError (nothing at that spot), GeocodingUnavailable."""
    lat, lng = round(lat, 6), round(lng, 6)
    if not in_india_bounds(lat, lng):
        raise OutsideServiceArea
    # ~1 m cache cells — nudging the pin by a pixel shouldn't re-query.
    key = REVERSE_CACHE_KEY.format(lat=f"{lat:.5f}", lng=f"{lng:.5f}")
    data = cache.get(key)
    if data is None:
        data = _fetch_reverse(lat, lng)
        if not isinstance(data, dict):
            raise GeocodingUnavailable
        cache.set(key, data, REVERSE_CACHE_SECONDS)
    if data.get("error") or not data.get("address"):
        raise LookupError(NOT_FOUND_MESSAGE)
    return _reconcile_with_india_post(address_from_nominatim(data, lat, lng))


def _location_errors(detected):
    """verify_address's errors for the fields that place the address
    (state/city/locality) — district mismatches are left for the form's
    usual district handling."""
    errors = pincode_service.verify_address(
        locality=detected.locality,
        city=detected.city,
        district=detected.district,
        state=detected.state,
        pincode=detected.pincode,
    ).errors
    return {k: v for k, v in errors.items() if k in ("state", "city", "locality")}


def _reconcile_with_india_post(detected):
    """Make an OSM-detected address agree with India Post where India Post
    clearly says how, so a map pick doesn't pre-fill something checkout
    would then reject:
      * an OSM postcode that isn't a real PIN is dropped;
      * an OSM suburb/village name that India Post files under a different
        PIN is moved from Village/Locality to Address Line 2 (it's still
        useful to the courier, just not the postal locality);
      * a missing or mismatched PIN is taken from the post office named
        like the locality/city — only when exactly one PIN in the state has
        that post office and the result verifies.
    Best effort: if India Post can't be reached the OSM values are returned
    unchanged (the save-time verification still applies)."""
    try:
        if detected.pincode and pincode_service.lookup_pincode(detected.pincode) is None:
            detected = replace(detected, pincode="")

        if detected.pincode and detected.locality and "locality" in _location_errors(detected):
            moved = replace(detected, locality="", address_line2=_join(detected.address_line2, detected.locality))
            if "locality" not in _location_errors(moved):
                detected = moved

        if detected.state and (not detected.pincode or _location_errors(detected)):
            for name in (detected.locality, detected.city):
                if not name:
                    continue
                pins = pincode_service.pincodes_for_post_office(name, detected.state)
                if len(pins) == 1 and pins[0] != detected.pincode:
                    candidate = replace(detected, pincode=pins[0])
                    if not _location_errors(candidate):
                        detected = candidate
                        break
    except pincode_service.PincodeServiceUnavailable:
        pass
    return detected


def _search_label(props):
    primary = props.get("name") or _join(props.get("housenumber"), props.get("street"))
    secondary = _join(
        props.get("street") if props.get("name") else "",
        props.get("district"),
        props.get("city"),
        props.get("county") if not props.get("city") else "",
        props.get("state"),
        props.get("postcode"),
    )
    return primary or secondary, secondary if primary else ""


def search_places(query, bias=None):
    """Up to SEARCH_LIMIT places in India matching `query`, as
    [{"title", "subtitle", "latitude", "longitude"}]. `bias` (lat, lng)
    ranks results near the map's current view first. Raises
    GeocodingUnavailable."""
    query = " ".join(query.split())[:SEARCH_MAX_LENGTH]
    if len(query) < SEARCH_MIN_LENGTH:
        return []
    bias = (round(bias[0], 1), round(bias[1], 1)) if bias else None
    # Hashed: free text isn't a safe cache key on every backend.
    digest = hashlib.sha256(f"{query.lower()}|{bias or ''}".encode()).hexdigest()
    key = SEARCH_CACHE_KEY.format(digest=digest)
    results = cache.get(key)
    if results is not None:
        return results

    results = []
    seen = set()
    for feature in _fetch_search(query, bias):
        props = feature.get("properties") or {}
        coords = (feature.get("geometry") or {}).get("coordinates") or []
        if (props.get("countrycode") or "").upper() != "IN" or len(coords) != 2:
            continue
        lng, lat = float(coords[0]), float(coords[1])
        title, subtitle = _search_label(props)
        if not title or (title, subtitle) in seen:
            continue
        seen.add((title, subtitle))
        results.append({"title": title, "subtitle": subtitle, "latitude": round(lat, 6), "longitude": round(lng, 6)})
        if len(results) == SEARCH_LIMIT:
            break
    cache.set(key, results, SEARCH_CACHE_SECONDS)
    return results
