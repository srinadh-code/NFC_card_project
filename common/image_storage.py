"""
Shared image upload/delete service.

Single source of truth for "upload an admin-supplied image, get back a URL
I can store": every Website Content image (Home Hero phone/NFC card,
testimonials, company logos, about page) calls this module instead of
rolling its own Cloudinary integration. Uploads to Cloudinary when it's
configured (see config/settings.py's Cloudinary block — the same
CLOUDINARY_CLOUD_NAME/API_KEY/API_SECRET env vars used everywhere else in
this project), and transparently falls back to local Django media storage
when it isn't, so these admin screens work with zero setup in local dev and
switch to Cloudinary automatically the moment real credentials are added.

Not used by profile avatar/cover uploads (accounts.User.avatar,
profiles.Profile.avatar/cover_image) — those are plain Django ImageFields
whose storage backend (Cloudinary vs. local) is selected globally via
config/settings.py's STORAGES setting, with no explicit upload call for any
view to redirect here. That mechanism reads the same underlying Cloudinary
credentials but has no concept of a `public_id`, so it's a structurally
different flow and is left as-is.
"""

import uuid

import cloudinary.uploader
from django.core.files.storage import default_storage
from rest_framework.exceptions import ValidationError

ALLOWED_CONTENT_TYPES = {"image/jpeg", "image/png", "image/webp", "image/svg+xml"}
MAX_UPLOAD_BYTES = 5 * 1024 * 1024  # 5MB

# Local-storage public ids are prefixed so delete_image() can tell them apart
# from real Cloudinary public ids without a separate storage-kind column.
LOCAL_PREFIX = "local:"


def validate_image_file(file_obj):
    content_type = getattr(file_obj, "content_type", None)
    if content_type not in ALLOWED_CONTENT_TYPES:
        raise ValidationError({"image": ["Unsupported image type. Use JPEG, PNG, WEBP, or SVG."]})
    if file_obj.size > MAX_UPLOAD_BYTES:
        raise ValidationError({"image": ["Image must be smaller than 5MB."]})


def _cloudinary_configured():
    return bool(cloudinary.config().cloud_name)


def _local_extension(file_obj):
    name = getattr(file_obj, "name", "") or ""
    return name.rsplit(".", 1)[-1].lower() if "." in name else "jpg"


def _upload_local(file_obj, folder, request=None):
    path = f"{folder}/{uuid.uuid4().hex}.{_local_extension(file_obj)}"
    saved_path = default_storage.save(path, file_obj)
    url = default_storage.url(saved_path)
    if request is not None:
        url = request.build_absolute_uri(url)
    return {"url": url, "public_id": f"{LOCAL_PREFIX}{saved_path}", "storage_type": "local"}


def upload_image(file_obj, folder, request=None):
    """
    Validates and uploads `file_obj`. Raises ValidationError on any failure —
    callers must not touch the database unless this returns successfully.

    Returns {"url": str, "public_id": str, "storage_type": "cloudinary" | "local"}.
    """
    validate_image_file(file_obj)

    if not _cloudinary_configured():
        return _upload_local(file_obj, folder, request=request)

    try:
        result = cloudinary.uploader.upload(file_obj, folder=folder, resource_type="image")
    except Exception as exc:
        raise ValidationError({"image": [f"Image upload failed: {exc}"]})
    return {
        "url": result["secure_url"],
        "public_id": result["public_id"],
        "storage_type": "cloudinary",
    }


def delete_image(public_id):
    """Best-effort cleanup of a replaced/removed asset — never raises."""
    if not public_id:
        return
    if public_id.startswith(LOCAL_PREFIX):
        try:
            default_storage.delete(public_id[len(LOCAL_PREFIX):])
        except Exception:
            pass
        return
    try:
        cloudinary.uploader.destroy(public_id, resource_type="image")
    except Exception:
        pass
