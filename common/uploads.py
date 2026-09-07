from common.response import error


def image_upload_error(file, max_mb=5):
    """
    Validates an uploaded image file (presence, content-type, size).
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
    return None
