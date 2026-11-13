"""Fail closed if an offline test accidentally reaches an external service."""

from unittest.mock import patch

from django.test.runner import DiscoverRunner


class OfflineSecurityTestRunner(DiscoverRunner):
    def run_tests(self, *args, **kwargs):
        with patch("socket.socket.connect", side_effect=AssertionError(
            "Outbound network is disabled in security tests; mock the integration."
        )), patch("socket.create_connection", side_effect=AssertionError(
            "Outbound network is disabled in security tests; mock the integration."
        )), patch("socket.getaddrinfo", side_effect=AssertionError(
            "Outbound DNS is disabled in security tests; mock the integration."
        )):
            return super().run_tests(*args, **kwargs)
