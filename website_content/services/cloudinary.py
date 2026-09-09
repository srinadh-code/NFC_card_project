"""
Cloudinary upload helpers for the Website Content module.

All website-content images go through here so the validate-before-save and
cleanup-after-replace rules in the spec are enforced in exactly one place,
instead of being re-implemented per resource.
"""

import cloudinary.uploader
from rest_framework.exceptions import ValidationError

ALLOWED_CONTENT_TYPES = {"image/jpeg", "image/png", "image/webp", "image/svg+xml"}
MAX_UPLOAD_BYTES = 5 * 1024 * 1024  # 5MB


def validate_image_file(file_obj):
    content_type = getattr(file_obj, "content_type", None)
    if content_type not in ALLOWED_CONTENT_TYPES:
        raise ValidationError({"image": ["Unsupported image type. Use JPEG, PNG, WEBP, or SVG."]})
    if file_obj.size > MAX_UPLOAD_BYTES:
        raise ValidationError({"image": ["Image must be smaller than 5MB."]})


def upload_image(file_obj, folder):
    """
    Validates and uploads `file_obj` to Cloudinary. Raises ValidationError on
    any failure — callers must not touch the database unless this returns.
    """
    validate_image_file(file_obj)
    try:
        result = cloudinary.uploader.upload(file_obj, folder=folder, resource_type="image")
    except Exception as exc:
        raise ValidationError({"image": [f"Image upload failed: {exc}"]})
    return result["secure_url"], result["public_id"]


def delete_image(public_id):
    """Best-effort cleanup of a replaced/removed asset — never raises."""
    if not public_id:
        return
    try:
        cloudinary.uploader.destroy(public_id, resource_type="image")
    except Exception:
        pass
