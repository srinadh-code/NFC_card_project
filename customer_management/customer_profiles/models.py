"""
This module intentionally defines no models. The customer-facing profile
is the same `profiles.Profile` row the rest of the platform (public profile
page, NFC card resolve, admin) already reads and writes — this app is a
dedicated API surface over it, not a second source of truth.
"""
