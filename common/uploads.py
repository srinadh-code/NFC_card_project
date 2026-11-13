from common.response import error
from common.image_validation import validate_image_content


def image_upload_error(file, max_mb=5):
    """
    Validates an uploaded image file (presence, type, size and contents).
    Returns an error Response ready to be returned by the view, or None
    when the file is valid. Shared by every module that accepts an image
    upload (profile photo, cover image, etc.) so the same rules apply
    everywhere.
    """
    if not file:
        return error("No image file provided.", status=400)
    if not str(file.content_type).startswith("image/"):
        return error("File must be an image.", status=400)
    if file.size > max_mb * 1024 * 1024:
        return error(f"Image must be smaller than {max_mb}MB.", status=400)
    try:
        validate_image_content(file)
    except ValueError as exc:
        return error(str(exc), status=400)
    return None
