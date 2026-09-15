"""
Google Sign-In — verifies the ID token ("credential") the frontend's Google
Identity Services button hands us, with no server-side redirect dance and no
django-allauth: the browser talks to Google directly (via the
@react-oauth/google button, Authorized JavaScript origin only — no
Authorized redirect URI is used by this flow), gets back a signed JWT
proving who the user is, and this module is the one place that checks that
signature is real before anything in the view trusts its contents.

Verification, not blind trust: every field below (audience, issuer,
expiry, signature) is checked by `jwt.decode` itself — a token that merely
*claims* an email address without a valid Google signature over it is
rejected before it ever reaches GoogleLoginView.
"""

import jwt
from django.conf import settings

GOOGLE_JWKS_URL = "https://www.googleapis.com/oauth2/v3/certs"
GOOGLE_ISSUERS = ("https://accounts.google.com", "accounts.google.com")

# One shared client per process: PyJWKClient caches Google's public signing
# keys in memory and only re-fetches them when a token's `kid` isn't in the
# cache (e.g. after Google's routine key rotation), so normal request volume
# costs zero extra network calls per login.
_jwk_client = jwt.PyJWKClient(GOOGLE_JWKS_URL)


class GoogleTokenError(Exception):
    """Raised for any Google ID token that fails verification — bad
    signature, wrong audience/issuer, expired, or malformed. The view
    catches this and returns a single generic 400 to the client (never the
    underlying jwt exception detail, which could hint at *why* a forged
    token failed)."""


def verify_google_id_token(token: str) -> dict:
    """Verify `token` as a genuine Google-issued ID token for this app's
    OAuth client, and return its claims. Raises GoogleTokenError on any
    failure. Never call this with an unverified assumption that the return
    value is safe — that's the entire point of this function."""
    if not token or not isinstance(token, str):
        raise GoogleTokenError("Missing Google credential.")

    try:
        signing_key = _jwk_client.get_signing_key_from_jwt(token)
        claims = jwt.decode(
            token,
            signing_key.key,
            algorithms=["RS256"],
            audience=settings.GOOGLE_OAUTH_CLIENT_ID,
            issuer=GOOGLE_ISSUERS,
            options={"require": ["exp", "iat", "sub", "email"]},
        )
    except jwt.PyJWTError as exc:
        raise GoogleTokenError(f"Invalid Google credential: {exc}") from exc

    # Google only sets this false for edge cases it explicitly couldn't
    # verify (e.g. some legacy Google Workspace configurations) — reject
    # rather than trust an email Google itself won't vouch for.
    if claims.get("email_verified") is False:
        raise GoogleTokenError("Google has not verified this account's email address.")

    return claims
