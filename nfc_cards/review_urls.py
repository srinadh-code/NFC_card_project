"""Google review destinations, resolved once when saved, never on a public tap.

Only explicit Google write-review links are persisted. Google's short links must
resolve to one of those links through a small allowlisted HTTPS redirect chain;
an ordinary Maps share link is not proof that its destination is a review form.
"""

import http.client
import ipaddress
import logging
import queue
import re
import socket
import ssl
import threading
from urllib.parse import parse_qs, urlencode, urljoin, urlsplit

from django.core.exceptions import ValidationError

logger = logging.getLogger("nfc_cards.review_urls")

_SHORT_HOSTS = frozenset({"g.page", "maps.app.goo.gl"})
_ALLOWED_HOSTS = _SHORT_HOSTS | {"search.google.com", "www.google.com", "maps.google.com"}
_PLACE_ID = re.compile(r"[A-Za-z0-9_-]{1,256}\Z")
_MAPS_WRITE_REVIEW = re.compile(
    r"/maps/place//data=!4m3!3m2!1s"
    r"(?P<identifier>0x[0-9A-Fa-f]{1,16}:0x[0-9A-Fa-f]{1,16}|[A-Za-z0-9_-]{1,256})!12e1\Z"
)
_SHORT_PATH = re.compile(r"/(?:r/)?[A-Za-z0-9_-]+(?:/review)?/?\Z")
_MAX_REDIRECTS = 3
_DNS_TIMEOUT_SECONDS = 2
_ERROR = "Enter a Google Business Profile review link with a valid Place ID."
_EXPANSION_ERROR = "The Google short link could not be verified. Copy your business's full Google review link and try again."
_LISTING_ERROR = (
    "This Google Maps link opens a place listing, not the Write a review form. "
    "In your Google Business Profile, choose Read Reviews, then Get more reviews, and copy the review link."
)


def _is_maps_url(parsed):
    return parsed.hostname in {"www.google.com", "maps.google.com"} and (
        parsed.path == "/maps"
        or parsed.path.startswith("/maps/")
        or (parsed.hostname == "maps.google.com" and parsed.path == "/")
    )


def _expansion_error(reason, *, host, status=None):
    # Never log submitted URLs, redirect locations, response bodies or queries.
    # The caller's parsed hostname has already passed the exact allowlist.
    logger.warning("google_review.short_link_failed reason=%s host=%s status=%s", reason, host, status)
    return ValidationError(_EXPANSION_ERROR, code="google_review_unverified")


def _listing_error(*, host, status=None):
    logger.info("google_review.non_review_destination host=%s status=%s", host, status)
    return ValidationError(_LISTING_ERROR, code="google_maps_listing")


def _parsed_url(value):
    if not isinstance(value, str) or len(value) > 2048:
        raise ValidationError(_ERROR)
    value = value.strip()
    # urlsplit strips some controls; reject those before parsing instead.
    if not value or any(ord(char) <= 32 or ord(char) == 127 for char in value) or "\\" in value:
        raise ValidationError(_ERROR)
    try:
        parsed = urlsplit(value)
        if (
            parsed.scheme != "https"
            or parsed.hostname not in _ALLOWED_HOSTS
            or parsed.username is not None
            or parsed.password is not None
            or parsed.port is not None
            or parsed.fragment
            or parsed.netloc.lower() != parsed.hostname
        ):
            raise ValidationError(_ERROR)
    except ValueError as exc:
        raise ValidationError(_ERROR) from exc
    return parsed


def _canonical_review(parsed):
    """Return a canonical direct review URL, or None for a non-review URL."""
    query = parse_qs(parsed.query, keep_blank_values=True, max_num_fields=30)
    if parsed.hostname in {"www.google.com", "maps.google.com"}:
        write_review = _MAPS_WRITE_REVIEW.fullmatch(parsed.path)
        if write_review:
            identifier = write_review.group("identifier")
            if identifier.isdigit() and (len(identifier) > 20 or int(identifier) > 18446744073709551615):
                raise ValidationError(_ERROR)
            # Google's documented writeAReviewUri carries an opaque Maps
            # identifier, which must never be treated as a Places Place ID.
            return "https://www.google.com" + parsed.path
    place_ids = None
    if parsed.hostname == "search.google.com" and parsed.path.rstrip("/") == "/local/writereview":
        place_ids = query.get("placeid")
    elif _is_maps_url(parsed):
        # Google Maps URLs can identify a business explicitly; turn that
        # Place ID into a review-form link rather than persisting a map page.
        if "placeid" in query and "query_place_id" in query:
            raise ValidationError(_ERROR)
        place_ids = query.get("placeid") or query.get("query_place_id")
    if place_ids is None:
        return None
    if len(place_ids) != 1 or not _PLACE_ID.fullmatch(place_ids[0]):
        raise ValidationError(_ERROR)
    result = "https://search.google.com/local/writereview?" + urlencode({"placeid": place_ids[0]})
    return result


def _public_dns(host):
    """Bound DNS waiting and reject every non-public answer before fetching."""
    answers = queue.Queue(maxsize=1)

    def lookup():
        try:
            answers.put(socket.getaddrinfo(host, 443, type=socket.SOCK_STREAM))
        except OSError as exc:
            answers.put(exc)

    threading.Thread(target=lookup, daemon=True).start()
    try:
        result = answers.get(timeout=_DNS_TIMEOUT_SECONDS)
    except queue.Empty as exc:
        raise _expansion_error("dns_timeout", host=host) from exc
    if isinstance(result, OSError):
        raise _expansion_error("dns_lookup_failed", host=host) from result
    if not result:
        raise _expansion_error("dns_no_addresses", host=host)
    try:
        if not all(ipaddress.ip_address(answer[4][0]).is_global for answer in result):
            raise _expansion_error("dns_non_public", host=host)
    except (ValueError, IndexError, TypeError) as exc:
        raise _expansion_error("dns_invalid_address", host=host) from exc
    addresses = {answer[4][0] for answer in result}
    return min(addresses, key=lambda address: (ipaddress.ip_address(address).version, address))


class _PinnedHTTPSConnection(http.client.HTTPSConnection):
    """Connect to the checked numeric address while validating Google's TLS."""

    def __init__(self, host, address):
        super().__init__(host, port=443, timeout=2, context=ssl.create_default_context())
        self._public_address = address

    def connect(self):
        family = socket.AF_INET6 if ipaddress.ip_address(self._public_address).version == 6 else socket.AF_INET
        raw_socket = socket.socket(family, socket.SOCK_STREAM)
        try:
            raw_socket.settimeout(2)
            # A numeric IP bypasses a second hostname lookup, closing the
            # DNS validation/connection gap. SNI and cert checks use Google.
            raw_socket.connect((self._public_address, 443))
            self.sock = self._context.wrap_socket(raw_socket, server_hostname=self.host)
            self.sock.settimeout(3)
        except BaseException:
            raw_socket.close()
            raise


def _request_redirect(parsed, address):
    connection = _PinnedHTTPSConnection(parsed.hostname, address)
    try:
        path = parsed.path + ("?" + parsed.query if parsed.query else "")
        connection.request("GET", path, headers={
            "Host": parsed.hostname,
            "User-Agent": "VRsGateway-ReviewLink/1.0",
            "Connection": "close",
        })
        response = connection.getresponse()
        try:
            return response.status, response.getheader("Location", "")
        finally:
            response.close()
    except (OSError, http.client.HTTPException, UnicodeError) as exc:
        raise _expansion_error(type(exc).__name__, host=parsed.hostname) from exc
    finally:
        connection.close()


def _expand_short_link(value):
    current = value
    visited = set()
    # No proxies or automatic redirects: each requested hop uses its checked
    # numeric address, with the original Google hostname for Host and TLS.
    for _ in range(_MAX_REDIRECTS):
        parsed = _parsed_url(current)
        canonical = _canonical_review(parsed)
        if canonical:
            return canonical
        if current in visited:
            raise _expansion_error("redirect_loop", host=parsed.hostname)
        visited.add(current)
        if parsed.hostname in _SHORT_HOSTS:
            if not _SHORT_PATH.fullmatch(parsed.path):
                raise ValidationError(_ERROR)
        elif not _is_maps_url(parsed):
            raise ValidationError(_ERROR)
        address = _public_dns(parsed.hostname)
        status, location = _request_redirect(parsed, address)
        if status == 200 and _is_maps_url(parsed):
            # A Maps place page (including a locality or read-reviews page)
            # is not evidence of a reviewable business or a write-review form.
            # Never reinterpret its opaque Maps identifier as a Places ID.
            raise _listing_error(host=parsed.hostname, status=status)
        if status not in (301, 302, 303, 307, 308) or not location:
            raise _expansion_error("missing_review_redirect", host=parsed.hostname, status=status)
        current = urljoin(current, location)
        # Validate the next hop even when this exhausts the limit.
        next_parsed = _parsed_url(current)
        canonical = _canonical_review(next_parsed)
        if canonical:
            return canonical
    raise _expansion_error("redirect_limit", host=next_parsed.hostname)


def validate_review_url(value, *, expand_short_links=False):
    """Validate/canonicalize a destination; optional network is save-only.

    Blank input clears the destination. Public resolution uses the default,
    which rejects unexpanded short links and never performs DNS or HTTP.
    """
    if value == "" or (isinstance(value, str) and not value.strip()):
        return ""
    parsed = _parsed_url(value)
    try:
        canonical = _canonical_review(parsed)
        if canonical:
            return canonical
        if expand_short_links and parsed.hostname in _SHORT_HOSTS:
            return _expand_short_link(value.strip())
        if _is_maps_url(parsed):
            raise _listing_error(host=parsed.hostname)
    except ValueError as exc:
        raise ValidationError(_ERROR) from exc
    raise ValidationError(_ERROR)
