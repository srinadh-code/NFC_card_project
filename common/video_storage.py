"""
Shared video upload/delete service — the video counterpart to
common.image_storage, used by the Home page demo video (see
website_content.views.admin.HomeHeroDemoVideoAdminView).

Same contract as image_storage: Cloudinary-only, validates before uploading,
raises ValidationError on any failure, and never writes to local disk.
Callers must not touch the database unless `upload_video()` returns.
"""

import os

import cloudinary.uploader
from rest_framework.exceptions import ValidationError

ALLOWED_CONTENT_TYPES = {"video/mp4"}
ALLOWED_EXTENSIONS = {".mp4"}
# Kept well under Cloudinary's per-video limit and small enough to upload
# within the Render web service's 120s gunicorn timeout (render.yaml).
MAX_UPLOAD_BYTES = 50 * 1024 * 1024  # 50MB
# upload_large sends the file in chunks, so a large video never has to go
# to Cloudinary as one request.
CHUNK_SIZE = 6 * 1024 * 1024


def validate_video_file(file_obj):
    """Rejects anything that isn't a real MP4 under the size limit — checks
    the extension, the browser-reported type, and the file's own ISO-BMFF
    "ftyp" header, so a renamed non-video file never reaches Cloudinary."""
    ext = os.path.splitext(getattr(file_obj, "name", "") or "")[1].lower()
    content_type = getattr(file_obj, "content_type", None)
    if ext not in ALLOWED_EXTENSIONS or content_type not in ALLOWED_CONTENT_TYPES:
        raise ValidationError({"video": ["Unsupported video type. Upload an MP4 (.mp4) file."]})
    if file_obj.size == 0:
        raise ValidationError({"video": ["The selected video file is empty."]})
    if file_obj.size > MAX_UPLOAD_BYTES:
        raise ValidationError({"video": ["Video must be smaller than 50MB."]})

    file_obj.seek(0)
    header = file_obj.read(12)
    file_obj.seek(0)
    if len(header) < 12 or header[4:8] != b"ftyp":
        raise ValidationError({"video": ["This file isn't a valid MP4 video."]})


def _cloudinary_configured():
    return bool(cloudinary.config().cloud_name)


def upload_video(file_obj, folder):
    """
    Validates and uploads `file_obj` to Cloudinary as a video resource, then
    verifies Cloudinary actually stored an MP4 video — an unexpected result
    is destroyed again rather than left behind. Raises ValidationError on
    any failure.

    Returns {"url": str, "public_id": str}.
    """
    validate_video_file(file_obj)

    if not _cloudinary_configured():
        raise ValidationError(
            {"video": ["Video storage is not configured on this server. Set CLOUDINARY_CLOUD_NAME, "
                       "CLOUDINARY_API_KEY and CLOUDINARY_API_SECRET (or CLOUDINARY_URL)."]}
        )

    try:
        result = cloudinary.uploader.upload_large(
            file_obj,
            folder=folder,
            resource_type="video",
            chunk_size=CHUNK_SIZE,
            filename=getattr(file_obj, "name", None) or "video.mp4",
        )
    except Exception as exc:
        raise ValidationError({"video": [f"Video upload failed: {exc}"]})

    public_id = (result or {}).get("public_id")
    url = (result or {}).get("secure_url")
    if not public_id or not url or result.get("resource_type") != "video" or result.get("format") != "mp4":
        delete_video(public_id)
        raise ValidationError({"video": ["Video upload failed: Cloudinary did not return a playable MP4 video."]})

    return {"url": url, "public_id": public_id}


def delete_video(public_id):
    """Best-effort cleanup of a replaced Cloudinary video — never raises,
    since a failed cleanup must never block the save that triggered it."""
    if not public_id:
        return
    try:
        cloudinary.uploader.destroy(public_id, resource_type="video", invalidate=True)
    except Exception:
        pass
