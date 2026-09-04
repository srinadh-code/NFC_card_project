from rest_framework.response import Response
from rest_framework.views import exception_handler


def success(data=None, message="OK", status=200):
    return Response({"success": True, "message": message, "data": data}, status=status)


def error(message="Something went wrong", errors=None, status=400):
    return Response({"success": False, "message": message, "errors": errors or {}}, status=status)


def _first_error_message(data):
    """Depth-first search for the first human-readable message in a DRF
    error payload, e.g. {"non_field_errors": ["Invalid email or password."]}
    -> "Invalid email or password.", or {"email": ["..."]} -> "...". Falls
    back to None so callers can supply a generic message when nothing
    readable is found."""
    if isinstance(data, dict):
        for key in ("non_field_errors", "__all__"):
            if data.get(key):
                return _first_error_message(data[key])
        for value in data.values():
            message = _first_error_message(value)
            if message:
                return message
        return None
    if isinstance(data, list):
        for item in data:
            message = _first_error_message(item)
            if message:
                return message
        return None
    if data:
        return str(data)
    return None


def custom_exception_handler(exc, context):
    """
    Wraps DRF's default error responses (validation errors, 401/403/404, etc.)
    in the project-wide {success, message, errors} envelope, without needing
    to repeat this in every view. Never leaks stack traces — DRF's handler
    already only fires for handled exceptions; unhandled ones still 500 via
    Django's normal (DEBUG-gated) machinery.

    The top-level `message` always surfaces the actual reason (e.g. "Invalid
    email or password.", "An account with this email already exists.")
    instead of a generic "Validation failed" — the frontend displays this
    message directly, so burying the real reason in `errors` only left users
    looking at an unhelpful, identical message for every failure.
    """
    response = exception_handler(exc, context)

    if response is None:
        return None

    if isinstance(response.data, dict) and "detail" in response.data and len(response.data) == 1:
        message = str(response.data["detail"])
        errors = {}
    else:
        errors = response.data if isinstance(response.data, dict) else {"detail": response.data}
        message = _first_error_message(errors) or "Validation failed"

    response.data = {"success": False, "message": message, "errors": errors}
    return response
