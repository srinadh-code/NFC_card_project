"""Indian PIN code lookup and delivery-address verification.

The single source of truth for "does this PIN code exist, and does it
serve the place the customer typed" — used by CustomerAddressSerializer
(add/edit address), the address verify/lookup endpoints (checkout's live
status + the form's auto-fill), and the order create view (re-verified at
the moment of ordering, so neither a stale saved address nor a
hand-crafted API request can skip it).

Data source: India Post's PIN directory via the public
api.postalpincode.in service (no API key). Lookups are cached — PIN codes
almost never change, so a found PIN is cached for 30 days and a
non-existent one for a day. If the service can't be reached, verification
fails *closed* (PincodeServiceUnavailable) — an address is never reported
as verified when it couldn't actually be checked.

India Post's post-office records are current, but its *district* column
predates several state reorganisations (506344 Govindaraopet is still
filed under "Warangal", though it's been in Mulugu district since 2019).
So verification leans on post offices, not district names:

  1. PIN exists, and the state matches (alias-normalized — India Post
     also uses some old state names, see STATE_ALIASES).
  2. The location is one the PIN actually serves: the locality or city
     names one of the PIN's post offices or mandals/taluks (its "Block"),
     or — for cities, where the city *is* the postal district
     (Hyderabad, Mumbai) — the city equals the PIN's India Post district.
     A locality that is exactly the name of a different PIN's post office
     in the same state is rejected outright.
  3. District: accepted if it's India Post's district, or a verified
     successor of it (districts.LEGACY_DISTRICT_SUCCESSORS). Anything else
     needs the customer's explicit confirmation — and only once step 2 has
     already proven the location; it's never a way past steps 1-2.
"""

import logging
import re
from dataclasses import dataclass, field
from difflib import SequenceMatcher
from urllib.parse import quote

import requests
from django.core.cache import cache

from .districts import LEGACY_DISTRICT_SUCCESSORS

logger = logging.getLogger(__name__)

API_URL = "https://api.postalpincode.in/pincode/{pincode}"
POST_OFFICE_API_URL = "https://api.postalpincode.in/postoffice/{name}"
# The service resets connections from python-requests' default User-Agent.
REQUEST_HEADERS = {"User-Agent": "Mozilla/5.0 (compatible; VRsGateway-AddressVerification/1.0)"}
REQUEST_TIMEOUT_SECONDS = 8

FOUND_CACHE_SECONDS = 60 * 60 * 24 * 30
NOT_FOUND_CACHE_SECONDS = 60 * 60 * 24
CACHE_KEY = "pincode-lookup:v1:{pincode}"
POST_OFFICE_CACHE_KEY = "postoffice-lookup:v1:{name}"

# Indian PIN codes never start with 0 (first digit is the postal region, 1-9).
PINCODE_RE = re.compile(r"^[1-9]\d{5}$")

FORMAT_MESSAGE = "Please enter a valid 6-digit Indian PIN code."
NOT_FOUND_MESSAGE = "This PIN code does not exist. Please check and enter a valid PIN code."
UNAVAILABLE_MESSAGE = "We couldn't verify your PIN code right now. Please try again in a moment."

# Error key the frontend looks for to offer "keep my district anyway".
DISTRICT_CONFIRMATION_KEY = "district_confirmation_required"


class PincodeServiceUnavailable(Exception):
    """The PIN directory couldn't be reached or returned something
    unreadable — distinct from "this PIN doesn't exist"."""


# India Post state name -> the name the address form's State dropdown uses
# (frontend data/indian-states.ts). Keys/values compared after _norm().
STATE_ALIASES = {
    "chattisgarh": "chhattisgarh",
    "orissa": "odisha",
    "pondicherry": "puducherry",
    "andamannicobar": "andamanandnicobarislands",
    "andamanandnicobar": "andamanandnicobarislands",
    "dadranagarhaveli": "dadraandnagarhavelianddamananddiu",
    "dadraandnagarhaveli": "dadraandnagarhavelianddamananddiu",
    "damandiu": "dadraandnagarhavelianddamananddiu",
    "damananddiu": "dadraandnagarhavelianddamananddiu",
    "jammukashmir": "jammuandkashmir",
    "nctofdelhi": "delhi",
    "newdelhi": "delhi",
    "uttaranchal": "uttarakhand",
}

# Ladakh became its own UT in 2019; India Post still files Leh/Kargil PINs
# under Jammu & Kashmir.
LADAKH_DISTRICTS = {"leh", "kargil", "ladakh"}

# Alternative spellings of the *same* place (renames, transliterations,
# official long forms). Compared after _norm(). Splits into different
# districts belong in districts.py, not here.
PLACE_ALIAS_GROUPS = [
    {"gurugram", "gurgaon"},
    {"bengaluru", "bangalore"},
    {"mysuru", "mysore"},
    {"belagavi", "belgaum"},
    {"kalaburagi", "gulbarga"},
    {"vijayapura", "bijapur"},
    {"shivamogga", "shimoga"},
    {"mangaluru", "mangalore"},
    {"hubballi", "hubli"},
    {"tumakuru", "tumkur"},
    {"mumbai", "bombay"},
    {"kolkata", "calcutta", "kolkatta"},
    {"chennai", "madras"},
    {"puducherry", "pondicherry"},
    {"prayagraj", "allahabad"},
    {"ayodhya", "faizabad"},
    {"varanasi", "banaras", "benares"},
    {"vadodara", "baroda"},
    {"thiruvananthapuram", "trivandrum"},
    {"kochi", "cochin", "ernakulam"},
    {"kozhikode", "calicut"},
    {"thrissur", "trichur"},
    {"thoothukudi", "tuticorin"},
    {"tiruchirappalli", "trichy", "tiruchirapalli"},
    {"visakhapatnam", "vizag", "vishakhapatnam"},
    {"shimla", "simla"},
    {"nuh", "mewat"},
    {"khordha", "khorda", "khurda"},
    # Telangana
    {"medchalmalkajgiri", "medchal", "malkajgiri"},
    {"rangareddy", "rangareddi", "kvrangareddy", "rangaredy"},
    {"mahabubnagar", "mahbubnagar"},
    {"hanumakonda", "hanamkonda"},
    {"jayashankarbhupalpally", "bhupalpally", "bhupalapally", "jayashankar"},
    {"komarambheemasifabad", "kumurambheemasifabad", "komarambheem", "asifabad"},
    {"rajannasircilla", "sircilla"},
    {"yadadribhuvanagiri", "yadadri", "bhuvanagiri", "bhongir"},
    {"bhadradrikothagudem", "kothagudem", "bhadradri"},
    {"jogulambagadwal", "gadwal"},
    {"jangaon", "jangoan", "janagama"},
    {"mulugu", "mulug"},
    # Andhra Pradesh
    {"kadapa", "cuddapah", "ysrkadapa", "ysr"},
    {"anantapur", "ananthapur", "ananthapuramu", "anantapuramu"},
    {"nellore", "spsrnellore", "sripottisriramulunellore"},
    {"konaseema", "drbrambedkarkonaseema", "ambedkarkonaseema"},
    {"allurisitharamaraju", "allurisitaramaraju", "asr"},
    {"srisathyasai", "sathyasai"},
]
_ALIAS_INDEX = {name: frozenset(group) for group in PLACE_ALIAS_GROUPS for name in group}

# Words that carry no place identity on their own ("Hyderabad District",
# "Gurgaon City", "Mahabubnagar H.O", "Govindaraopet Village") — stripped
# before comparing.
NOISE_WORDS = {
    "district", "dist", "city", "urban", "rural", "town", "ho", "so", "bo", "gpo", "po",
    "kty", "head", "post", "office", "the", "na", "village", "mandal",
}
# District/city names: lenient (spelling drift between India Post and
# common usage is the norm).
FUZZY_RATIO = 0.82
MIN_CONTAINMENT_LENGTH = 4
# Locality vs. post-office names: stricter — village names differ by a
# letter or two ("Rangapur"/"Narsapur") and must not cross-match.
LOCALITY_FUZZY_RATIO = 0.9
LOCALITY_MIN_CONTAINMENT_LENGTH = 5


def _norm(value):
    """Lowercase letters only, with noise words removed — so
    "K.V. Ranga Reddy District" and "kvrangareddy" compare equal."""
    words = re.findall(r"[a-z]+", (value or "").lower().replace("&", " and "))
    return "".join(w for w in words if w not in NOISE_WORDS)


def _norm_state(value):
    key = _norm(value)
    return STATE_ALIASES.get(key, key)


def _variants(name):
    """A normalized name plus every alias spelling of it."""
    return _ALIAS_INDEX.get(name, frozenset()) | {name}


def _names_match(entered, candidate, *, ratio=FUZZY_RATIO, min_containment=MIN_CONTAINMENT_LENGTH):
    if not entered or not candidate:
        return False
    for a in _variants(entered):
        for b in _variants(candidate):
            if a == b:
                return True
            shorter, longer = sorted((a, b), key=len)
            if len(shorter) >= min_containment and shorter in longer:
                return True
            if SequenceMatcher(None, a, b).ratio() >= ratio:
                return True
    return False


def _matches_any(entered, candidates, **kwargs):
    return next((c for c in candidates if _names_match(entered, _norm(c), **kwargs)), None)


def _matches_locality(entered, candidates):
    return _matches_any(
        entered, candidates, ratio=LOCALITY_FUZZY_RATIO, min_containment=LOCALITY_MIN_CONTAINMENT_LENGTH
    )


# (normalized state, normalized legacy district or alias) -> successor names
_SUCCESSOR_INDEX = {
    (_norm_state(state), variant): successors
    for state, legacy in LEGACY_DISTRICT_SUCCESSORS.items()
    for district, successors in legacy.items()
    for variant in _variants(_norm(district))
}


def current_districts_for(state, legacy_districts):
    """Every present-day district that took territory from any of these
    India Post (legacy) districts — the legacy names themselves when the
    state has no reorganisation on record."""
    result = []
    for district in legacy_districts:
        successors = next(
            (
                _SUCCESSOR_INDEX[(_norm_state(state), v)]
                for v in _variants(_norm(district))
                if (_norm_state(state), v) in _SUCCESSOR_INDEX
            ),
            [district],
        )
        result.extend(successors)
    return _unique(result)


@dataclass
class PincodeInfo:
    pincode: str
    # Display names as India Post spells them (deduplicated, input order).
    states: list
    districts: list
    post_offices: list
    # Mandal/taluk/tehsil names ("Block") — finer than district, and what
    # a rural address's city/locality usually names.
    blocks: list = field(default_factory=list)
    divisions: list = field(default_factory=list)
    # Present-day districts the PIN may now fall in (see districts.py).
    current_districts: list = field(default_factory=list)

    @property
    def state(self):
        return self.states[0] if self.states else ""

    @property
    def served_places(self):
        """Names the PIN itself serves — what a locality must match."""
        return _unique([*self.post_offices, *self.blocks])

    def as_dict(self):
        return {
            "pincode": self.pincode,
            "state": self.state,
            "states": self.states,
            "districts": self.districts,
            "current_districts": self.current_districts,
            "post_offices": self.post_offices,
            "blocks": self.blocks,
        }


def _unique(values):
    seen, result = set(), []
    for v in values:
        v = (v or "").strip()
        if v and v.upper() != "NA" and v.lower() not in seen:
            seen.add(v.lower())
            result.append(v)
    return result


# Canonical display spelling for a few India Post state names, so the
# auto-filled State matches an option in the address form's dropdown.
STATE_DISPLAY = {
    "chhattisgarh": "Chhattisgarh",
    "odisha": "Odisha",
    "puducherry": "Puducherry",
    "andamanandnicobarislands": "Andaman and Nicobar Islands",
    "dadraandnagarhavelianddamananddiu": "Dadra and Nagar Haveli and Daman and Diu",
    "jammuandkashmir": "Jammu and Kashmir",
    "delhi": "Delhi",
    "uttarakhand": "Uttarakhand",
}


def _display_state(raw_state, districts):
    if {_norm(d) for d in districts} & LADAKH_DISTRICTS:
        return "Ladakh"
    return STATE_DISPLAY.get(_norm_state(raw_state), raw_state.strip())


def _get_json(url, label):
    try:
        response = requests.get(url, headers=REQUEST_HEADERS, timeout=REQUEST_TIMEOUT_SECONDS)
        response.raise_for_status()
        return response.json()[0]
    except (requests.RequestException, ValueError, IndexError, KeyError, TypeError) as exc:
        logger.warning("India Post lookup failed for %s: %s", label, exc)
        raise PincodeServiceUnavailable from exc


def _post_offices_from(record, label):
    status = str(record.get("Status", "")).lower()
    if status == "success":
        return record.get("PostOffice") or []
    if status == "error" and not record.get("PostOffice"):
        # The API's answer for something that isn't in the directory.
        return []
    logger.warning("Unexpected India Post response for %s: %r", label, record)
    raise PincodeServiceUnavailable


def _fetch_from_india_post(pincode):
    """Raw post-office list for a PIN ([] when it doesn't exist). Raises
    PincodeServiceUnavailable on any network/format problem."""
    return _post_offices_from(_get_json(API_URL.format(pincode=pincode), pincode), pincode)


def _fetch_post_offices_by_name(name):
    """Post offices anywhere in India whose name contains `name` (India
    Post's own search semantics). Raises PincodeServiceUnavailable."""
    return _post_offices_from(_get_json(POST_OFFICE_API_URL.format(name=quote(name)), name), name)


def lookup_pincode(pincode):
    """PincodeInfo for an existing PIN, None for a well-formed PIN that
    doesn't exist. Caller is responsible for the format check
    (is_valid_pincode_format). Raises PincodeServiceUnavailable."""
    key = CACHE_KEY.format(pincode=pincode)
    offices = cache.get(key)
    if offices is None:
        offices = _fetch_from_india_post(pincode)
        cache.set(key, offices, FOUND_CACHE_SECONDS if offices else NOT_FOUND_CACHE_SECONDS)
    if not offices:
        return None

    districts = _unique(o.get("District") for o in offices)
    states = _unique(_display_state(o.get("State", ""), [o.get("District", "")]) for o in offices)
    state = states[0] if states else ""
    return PincodeInfo(
        pincode=pincode,
        states=states,
        districts=districts,
        post_offices=_unique(o.get("Name") for o in offices),
        blocks=_unique(o.get("Block") for o in offices),
        divisions=_unique(o.get("Division") for o in offices),
        current_districts=current_districts_for(state, districts),
    )


def pincodes_for_post_office(name, state):
    """PIN codes of post offices in `state` named exactly `name` (sorted;
    empty when the name isn't a post office there). Raises
    PincodeServiceUnavailable."""
    key = POST_OFFICE_CACHE_KEY.format(name=_norm(name))
    offices = cache.get(key)
    if offices is None:
        offices = _fetch_post_offices_by_name(name.strip())
        cache.set(key, offices, FOUND_CACHE_SECONDS)
    wanted, wanted_state = _norm(name), _norm_state(state)
    return sorted(
        {
            str(o.get("Pincode", ""))
            for o in offices
            if _norm(o.get("Name")) == wanted
            and _norm_state(_display_state(o.get("State", ""), [o.get("District", "")])) == wanted_state
        }
    )


def other_pincodes_for_post_office(name, state, pincode):
    """PIN codes (other than `pincode`) of post offices in `state` named
    exactly `name` — i.e. evidence that the customer's locality is served
    by a different PIN. Empty when the name isn't a post office at all
    (colony/street names usually aren't) or the lookup can't be made: this
    check only ever adds a rejection, so an outage simply skips it."""
    try:
        return [pin for pin in pincodes_for_post_office(name, state) if pin != pincode]
    except PincodeServiceUnavailable:
        return []


def is_valid_pincode_format(pincode):
    return bool(PINCODE_RE.match((pincode or "").strip()))


def _sample(names, limit=4):
    shown = ", ".join(names[:limit])
    return f"{shown} and {len(names) - limit} more" if len(names) > limit else shown


@dataclass
class AddressVerification:
    errors: dict
    info: "PincodeInfo | None" = None
    # The PIN's own post office/mandal the address was matched to.
    matched_place: str = ""
    # Set when the district was accepted via the legacy mapping or the
    # customer's confirmation rather than a direct match.
    district_note: str = ""

    @property
    def verified(self):
        return not self.errors

    def as_dict(self):
        return {
            "verified": self.verified,
            "errors": self.errors,
            "matched_place": self.matched_place,
            "district_note": self.district_note,
            "location": self.info.as_dict() if self.info else None,
        }


def verify_address(*, city, district, state, pincode, locality="", district_confirmed=False):
    """Checks an address against India Post's record for its PIN (see the
    module docstring for the rules). `district_confirmed` is the customer
    explicitly keeping a district that neither India Post nor the legacy
    mapping lists — honoured only once the location itself is proven.
    Raises PincodeServiceUnavailable."""
    pincode = (pincode or "").strip()
    if not is_valid_pincode_format(pincode):
        return AddressVerification({"pincode": FORMAT_MESSAGE})

    info = lookup_pincode(pincode)
    if info is None:
        return AddressVerification({"pincode": NOT_FOUND_MESSAGE})

    served = info.served_places
    where = f"{_sample(served, 3)}, {info.state}" if served else info.state

    # 1. State
    entered_state = _norm_state(state)
    if not entered_state or entered_state not in {_norm_state(s) for s in info.states}:
        return AddressVerification(
            {
                "pincode": f"PIN code {pincode} belongs to {info.state}, not {state.strip() or 'the selected state'}.",
                "state": f"Selected state does not match PIN code {pincode} ({info.state}).",
            },
            info,
        )

    errors = {}
    city_n, locality_n = _norm(city), _norm(locality)
    postal_areas = [*info.districts, *info.divisions]

    # 2. Locality — must not be another PIN's post office.
    locality_place = _matches_locality(locality_n, served) if locality_n else None
    if locality_n and not locality_place:
        other_pins = other_pincodes_for_post_office(locality, info.state, pincode)
        if other_pins:
            errors["locality"] = (
                f"{locality.strip()} is served by PIN code {', '.join(other_pins[:3])}, not {pincode}."
            )

    # 2. City — a served place, the postal district (cities), or a
    # present-day district/town the PIN may now fall in.
    city_place = _matches_locality(city_n, served)
    city_ok = bool(
        city_place
        or _matches_any(city_n, postal_areas)
        or _matches_any(city_n, info.current_districts)
    )
    if not city_ok:
        errors["city"] = f"City does not match PIN code {pincode}. This PIN serves {where}."

    # 2. Proof the PIN serves this location: a post office/mandal match,
    # or a city that is itself the PIN's postal district.
    matched_place = locality_place or city_place
    if not errors and not matched_place and not _matches_any(city_n, postal_areas):
        errors["locality"] = (
            f"Please enter your village/locality or post office. PIN code {pincode} serves {_sample(served)}."
        )

    # 3. District
    district_n = _norm(district)
    district_note = ""
    if _matches_any(district_n, info.districts):
        pass
    elif _matches_any(district_n, info.current_districts):
        district_note = (
            f"India Post still lists PIN code {pincode} under {' / '.join(info.districts)} district "
            f"(before the district reorganisation); accepted as {district.strip()}."
        )
    elif matched_place and district_confirmed and not errors:
        district_note = f"District {district.strip()} confirmed by customer (India Post lists {' / '.join(info.districts)})."
    else:
        listed = _unique([*info.current_districts, *info.districts])
        message = f"District does not match PIN code {pincode} (expected {_sample(listed, 5)})."
        errors["district"] = message
        if matched_place and not errors.get("city") and not errors.get("locality"):
            # Location is proven by its post office — let the customer
            # confirm a district our mapping doesn't know about.
            errors[DISTRICT_CONFIRMATION_KEY] = (
                f"{matched_place} is served by PIN code {pincode}, but India Post lists it under "
                f"{' / '.join(info.districts)} district. Confirm {district.strip()} only if it is correct."
            )

    if errors:
        # Summary shown next to the PIN field / on checkout.
        errors["pincode"] = next(v for k, v in errors.items() if k != DISTRICT_CONFIRMATION_KEY)
    return AddressVerification(errors, info, matched_place=matched_place or "", district_note=district_note)


def verify_saved_address(address):
    """verify_address for a saved CustomerAddress — what checkout's status
    and order creation both use. A district the customer explicitly
    confirmed when saving can't be told apart from the row alone (there's
    no column for it), so an unmapped district is non-blocking here; every
    other rule (PIN exists, state, served locality/city) still applies."""
    return verify_address(
        locality=address.locality,
        city=address.city,
        district=address.district,
        state=address.state,
        pincode=address.pincode,
        district_confirmed=True,
    )
