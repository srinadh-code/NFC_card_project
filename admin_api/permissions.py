# Every admin_api view imports its permission class from here rather than
# reaching into `common.permissions` directly — one conceptual entry point
# for "what does it take to call an Admin API". The actual implementation
# stays in `common.permissions` since it's also used by non-admin_api code
# (e.g. `nfc_cards` importing IsAdminRole before this package existed).
from common.permissions import IsAdminRole

__all__ = ["IsAdminRole"]
