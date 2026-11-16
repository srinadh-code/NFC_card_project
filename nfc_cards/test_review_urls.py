import http.client
import socket
import ssl
from unittest.mock import patch
from urllib.parse import urlsplit

from django.core.exceptions import ValidationError
from django.test import SimpleTestCase

from .review_urls import _PinnedHTTPSConnection, _request_redirect, validate_review_url


CANONICAL = "https://search.google.com/local/writereview?placeid=ChIJ_Test-Place123"
MAPS_REVIEW = "https://www.google.com/maps/place//data=!4m3!3m2!1s0x808f778c55555555:0xa4f25c571acded3f!12e1"
PUBLIC_DNS = [(socket.AF_INET, socket.SOCK_STREAM, socket.IPPROTO_TCP, "", ("142.250.1.1", 443))]


class GoogleReviewUrlTests(SimpleTestCase):
    def test_official_maps_write_review_uri_is_preserved_without_inventing_a_place_id(self):
        with patch("nfc_cards.review_urls._request_redirect") as request:
            self.assertEqual(validate_review_url(MAPS_REVIEW + "?utm_source=tracking"), MAPS_REVIEW)
            self.assertEqual(validate_review_url("https://www.google.com/maps/place//data=!4m3!3m2!1s123456789!12e1"),
                             "https://www.google.com/maps/place//data=!4m3!3m2!1s123456789!12e1")
            self.assertEqual(validate_review_url("https://www.google.com/maps/place//data=!4m3!3m2!1sChIJ_Test123!12e1"),
                             "https://www.google.com/maps/place//data=!4m3!3m2!1sChIJ_Test123!12e1")
        request.assert_not_called()

    def test_short_link_can_expand_to_the_official_maps_review_form(self):
        with patch("nfc_cards.review_urls._public_dns", return_value="142.250.1.1"), \
             patch("nfc_cards.review_urls._request_redirect", return_value=(302, MAPS_REVIEW)):
            self.assertEqual(validate_review_url("https://g.page/r/example/review", expand_short_links=True), MAPS_REVIEW)

    def test_maps_review_path_rejects_read_reviews_photos_and_incomplete_identifiers(self):
        invalid = [
            MAPS_REVIEW.replace("!12e1", "!9m1!1b1"),
            MAPS_REVIEW.replace("!12e1", "!10e5"),
            MAPS_REVIEW.replace("!12e1", ""),
            MAPS_REVIEW + "!1shttps://evil.example",
            MAPS_REVIEW.replace("/maps/place//", "/maps/place/https://evil.example/"),
            MAPS_REVIEW.replace("0x808f778c55555555:0xa4f25c571acded3f", "0x123:"),
            MAPS_REVIEW.replace("0x808f778c55555555:0xa4f25c571acded3f", "0x123:0x"),
            MAPS_REVIEW.replace("0x808f778c55555555:0xa4f25c571acded3f", "18446744073709551616"),
            MAPS_REVIEW.replace("www.google.com", "www.google.com.evil.example"),
        ]
        for value in invalid:
            with self.subTest(value=value), self.assertRaises(ValidationError):
                validate_review_url(value)

    def test_direct_review_link_is_canonicalized_without_network(self):
        with patch("nfc_cards.review_urls.socket.getaddrinfo") as dns, patch("nfc_cards.review_urls._request_redirect") as request:
            self.assertEqual(validate_review_url(CANONICAL + "&source=g.page&laa=tracking"), CANONICAL)
        dns.assert_not_called()
        request.assert_not_called()

    def test_explicit_maps_place_id_becomes_a_direct_review_link(self):
        self.assertEqual(
            validate_review_url("https://www.google.com/maps/search/?api=1&query=Business&query_place_id=ChIJ_Test-Place123"),
            CANONICAL,
        )

    def test_blank_clears_the_destination(self):
        self.assertEqual(validate_review_url(""), "")
        self.assertEqual(validate_review_url("  "), "")

    def test_rejects_unsafe_or_non_review_destinations(self):
        invalid = [
            None, {}, 123,
            "http://search.google.com/local/writereview?placeid=ChIJ_Test-Place123",
            "https://search.google.com.evil.test/local/writereview?placeid=ChIJ_Test-Place123",
            "https://evil.test/search.google.com/local/writereview?placeid=ChIJ_Test-Place123",
            "https://user:password@search.google.com/local/writereview?placeid=ChIJ_Test-Place123",
            "https://search.google.com:443/local/writereview?placeid=ChIJ_Test-Place123",
            "https://search.google.com./local/writereview?placeid=ChIJ_Test-Place123",
            "https://search.google.com/local/writereview?placeid=first&placeid=second",
            "https://search.google.com/local/writereview?placeid=",
            "https://search.google.com/local/writereview?placeid=%2F%2Fevil.test",
            "https://search.google.com/local/writereview?placeid=x#fragment",
            "https://search.google.com/\nlocal/writereview?placeid=x",
            "https://search.google.com\\@evil.test/local/writereview?placeid=x",
            "https://www.google.com/url?q=https://evil.test",
            "https://www.google.com/maps?cid=123",
            "https://127.0.0.1/local/writereview?placeid=x",
            "https://[::1]/local/writereview?placeid=x",
            "https://www.google.com/maps?placeid=x&query_place_id=y",
            "https://search.google.com/local/writereview?placeid=" + "x" * 257,
            "https://search.google.com/local/writereview?" + "&".join("x=1" for _ in range(31)),
        ]
        for value in invalid:
            with self.subTest(value=value), self.assertRaises(ValidationError):
                validate_review_url(value, expand_short_links=True)

    def test_public_resolution_rejects_unexpanded_short_links_without_network(self):
        for value in ("https://g.page/r/business/review", "https://maps.app.goo.gl/example"):
            with self.subTest(value=value), patch("nfc_cards.review_urls._request_redirect") as request, self.assertRaises(ValidationError):
                validate_review_url(value)
            request.assert_not_called()

    def _expand(self, responses, *, dns=PUBLIC_DNS, value="https://g.page/r/business/review"):
        with patch("nfc_cards.review_urls.socket.getaddrinfo", return_value=dns) as lookup, \
                patch("nfc_cards.review_urls._request_redirect", side_effect=responses) as request:
            result = validate_review_url(value, expand_short_links=True)
        return result, request, lookup

    def test_short_link_expands_to_canonical_destination(self):
        result, request, lookup = self._expand([(302, CANONICAL + "&source=share")])
        self.assertEqual(result, CANONICAL)
        self.assertEqual(request.call_args.args[1], "142.250.1.1")
        lookup.assert_called_once_with("g.page", 443, type=socket.SOCK_STREAM)

    def test_maps_short_link_can_expand_through_another_allowlisted_short_host(self):
        result, request, lookup = self._expand([
            (302, "https://g.page/r/business/review"), (302, CANONICAL),
        ], value="https://maps.app.goo.gl/example")
        self.assertEqual(result, CANONICAL)
        self.assertEqual(request.call_count, 2)
        self.assertEqual(lookup.call_count, 2)

    def test_rejects_unsafe_redirect_before_requesting_it(self):
        for target in (
            "https://evil.test/", "http://g.page/r/business/review",
            "https://www.google.com/url?q=https://evil.test/",
            "https://g.page@127.0.0.1/", "https://maps.app.goo.gl:8443/example",
        ):
            with self.subTest(target=target), patch("nfc_cards.review_urls.socket.getaddrinfo", return_value=PUBLIC_DNS), \
                    patch("nfc_cards.review_urls._request_redirect", return_value=(302, target)) as request:
                with self.assertRaises(ValidationError):
                    validate_review_url("https://g.page/r/business/review", expand_short_links=True)
                self.assertEqual(request.call_count, 1)

    def test_rejects_private_dns_without_http(self):
        for address in ("127.0.0.1", "10.0.0.1", "169.254.169.254", "::1", "fc00::1"):
            with self.subTest(address=address):
                private_dns = [(socket.AF_INET, socket.SOCK_STREAM, 0, "", (address, 443))]
                with patch("nfc_cards.review_urls.socket.getaddrinfo", return_value=private_dns), \
                        patch("nfc_cards.review_urls._request_redirect") as request:
                    with self.assertRaises(ValidationError):
                        validate_review_url("https://g.page/r/business/review", expand_short_links=True)
                request.assert_not_called()

    def test_rejects_mixed_public_and_private_dns_answers(self):
        with self.assertRaises(ValidationError):
            self._expand([], dns=PUBLIC_DNS + [(socket.AF_INET, socket.SOCK_STREAM, 0, "", ("10.0.0.1", 443))])

    def test_checks_dns_again_for_every_requested_hop(self):
        with patch("nfc_cards.review_urls.socket.getaddrinfo", side_effect=[
            PUBLIC_DNS, [(socket.AF_INET, socket.SOCK_STREAM, 0, "", ("127.0.0.1", 443))],
        ]), patch("nfc_cards.review_urls._request_redirect", return_value=(302, "https://maps.app.goo.gl/example")) as request:
            with self.assertRaises(ValidationError):
                validate_review_url("https://g.page/r/business/review", expand_short_links=True)
        self.assertEqual(request.call_count, 1)

    def test_rejects_redirect_loop(self):
        with self.assertRaises(ValidationError):
            self._expand([(302, "https://g.page/r/business/review")])

    def test_rejects_more_than_three_redirects(self):
        with self.assertRaises(ValidationError):
            self._expand([(302, f"https://maps.app.goo.gl/hop{n}") for n in range(3)])

    def test_rejects_non_redirect_or_missing_location(self):
        for response in ((200, ""), (302, ""), (404, "")):
            with self.subTest(response=response), self.assertRaises(ValidationError):
                self._expand([response])

    def test_rejects_dns_error(self):
        with patch("nfc_cards.review_urls.socket.getaddrinfo", side_effect=socket.gaierror()), self.assertRaises(ValidationError):
            validate_review_url("https://g.page/r/business/review", expand_short_links=True)

    def test_pinned_connection_uses_numeric_address_and_original_tls_hostname(self):
        with patch("nfc_cards.review_urls.ssl.create_default_context") as context, \
                patch("nfc_cards.review_urls.socket.socket") as socket_class, \
                patch("nfc_cards.review_urls.socket.getaddrinfo") as dns:
            connection = _PinnedHTTPSConnection("g.page", "142.250.1.1")
            connection.connect()
        socket_class.return_value.connect.assert_called_once_with(("142.250.1.1", 443))
        context.return_value.wrap_socket.assert_called_once_with(socket_class.return_value, server_hostname="g.page")
        socket_class.return_value.settimeout.assert_called_once_with(2)
        context.return_value.wrap_socket.return_value.settimeout.assert_called_once_with(3)
        dns.assert_not_called()

    def test_pinned_connection_closes_socket_when_tls_fails(self):
        with patch("nfc_cards.review_urls.ssl.create_default_context") as context, \
                patch("nfc_cards.review_urls.socket.socket") as socket_class:
            context.return_value.wrap_socket.side_effect = ssl.SSLError("invalid certificate")
            connection = _PinnedHTTPSConnection("g.page", "142.250.1.1")
            with self.assertRaises(ssl.SSLError):
                connection.connect()
        socket_class.return_value.close.assert_called_once()

    def test_request_reads_only_headers_and_closes_response_and_connection(self):
        with patch("nfc_cards.review_urls._PinnedHTTPSConnection") as connection_class:
            connection = connection_class.return_value
            response = connection.getresponse.return_value
            response.status = 302
            response.getheader.return_value = CANONICAL
            result = _request_redirect(urlsplit("https://g.page/r/business/review"), "142.250.1.1")
        self.assertEqual(result, (302, CANONICAL))
        self.assertEqual(connection.request.call_args.kwargs["headers"]["Host"], "g.page")
        response.read.assert_not_called()
        response.close.assert_called_once()
        connection.close.assert_called_once()

    def test_transport_timeout_protocol_and_tls_errors_are_generic(self):
        for error in (TimeoutError(), OSError(), ssl.SSLError(), http.client.RemoteDisconnected()):
            with self.subTest(error=type(error).__name__), patch("nfc_cards.review_urls._PinnedHTTPSConnection") as connection_class:
                connection_class.return_value.request.side_effect = error
                with self.assertRaises(ValidationError):
                    _request_redirect(urlsplit("https://g.page/r/business/review"), "142.250.1.1")
                connection_class.return_value.close.assert_called_once()

    def test_unencoded_unicode_short_link_is_rejected_before_connecting(self):
        with patch("nfc_cards.review_urls._PinnedHTTPSConnection.connect") as connect:
            with self.assertRaises(ValidationError):
                _request_redirect(urlsplit("https://g.page/r/business/review?source=\u0928\u092e\u0938\u094d\u0924\u0947"), "142.250.1.1")
        connect.assert_not_called()
