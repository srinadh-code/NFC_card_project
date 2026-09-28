"""
Shared image upload/delete service.

Single source of truth for "upload an admin-supplied image, get back a URL
I can store": every Website Content image (Home Hero phone/NFC card,
testimonials, company logos, about page, features page) calls this module
instead of rolling its own Cloudinary integration.

Cloudinary-only, no fallback of any kind. If Cloudinary isn't configured
(see config/settings.py's Cloudinary block — the same
CLOUDINARY_CLOUD_NAME/API_KEY/API_SECRET env vars used everywhere else in
this project) or the upload itself fails, `upload_image()` raises a
ValidationError — it never writes to local disk. There is deliberately no
local-storage code path left in this module to fall back to.

Not used by profile avatar/cover uploads (accounts.User.avatar,
profiles.Profile.avatar/cover_image) — those are plain Django ImageFields
whose storage backend is STORAGES["default"] (config/settings.py), which is
likewise Cloudinary-only. That mechanism reads the same underlying
Cloudinary credentials but has no concept of a `public_id`, so it's a
structurally different flow and is left as-is.
"""

import cloudinary.uploader
from rest_framework.exceptions import ValidationError

ALLOWED_CONTENT_TYPES = {
    "image/jpeg",
    "image/png",
    "image/webp",
    "image/svg+xml",
    # .ico — needed for Website Content > Settings > General > Favicon,
    # which the admin UI explicitly supports alongside PNG/SVG. Browsers
    # report .ico files under either MIME type depending on OS/browser.
    "image/x-icon",
    "image/vnd.microsoft.icon",
}
MAX_UPLOAD_BYTES = 5 * 1024 * 1024  # 5MB


def validate_image_file(file_obj):
    content_type = getattr(file_obj, "content_type", None)
    if content_type not in ALLOWED_CONTENT_TYPES:
        raise ValidationError({"image": ["Unsupported image type. Use JPEG, PNG, WEBP, or SVG."]})
    if file_obj.size > MAX_UPLOAD_BYTES:
        raise ValidationError({"image": ["Image must be smaller than 5MB."]})


def _cloudinary_configured():
    return bool(cloudinary.config().cloud_name)


def upload_image(file_obj, folder, request=None):
    """
    Validates and uploads `file_obj` to Cloudinary. Raises ValidationError on
    any failure — including Cloudinary not being configured at all — and
    callers must not touch the database unless this returns successfully.
    `request` is accepted for call-site compatibility but unused: Cloudinary
    URLs are already absolute, unlike a local-storage relative path.

    Returns {"url": str, "public_id": str}.
    """
    validate_image_file(file_obj)

    if not _cloudinary_configured():
        raise ValidationError(
            {"image": ["Image storage is not configured on this server. Set CLOUDINARY_CLOUD_NAME, "
                       "CLOUDINARY_API_KEY and CLOUDINARY_API_SECRET (or CLOUDINARY_URL)."]}
        )

    try:
        result = cloudinary.uploader.upload(file_obj, folder=folder, resource_type="image")
    except ValidationError:
        raise
    except Exception as exc:
        raise ValidationError({"image": [f"Image upload failed: {exc}"]})

    return {"url": result["secure_url"], "public_id": result["public_id"]}


def delete_image(public_id):
    """Best-effort cleanup of a replaced/removed Cloudinary asset — never
    raises, since a failed cleanup must never block the save/remove that
    triggered it (the DB row is already the source of truth by that point)."""
    if not public_id:
        return
    try:
        cloudinary.uploader.destroy(public_id, resource_type="image")
    except Exception:
        pass
