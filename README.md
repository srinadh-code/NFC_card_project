# VR's NEXORA Backend (Phase A)

Django REST Framework backend for the NFC digital business card app. This
covers Phase A: authentication (register/OTP/login/JWT/logout/forgot &
reset password), customer profiles + social/custom links, and NFC card
activation/public resolve. See `../` project root conversation history /
commit messages for the Phase B roadmap (products, orders, analytics,
support, full admin API).

## Setup

```bash
python -m venv env
# Windows
env\Scripts\activate
# macOS/Linux
source env/bin/activate

pip install -r requirements.txt
cp .env.example .env    # defaults work out of the box for local dev (SQLite + console email)

python manage.py migrate
python manage.py createsuperuser
python manage.py seed_demo_cards   # creates 5 UNASSIGNED demo cards for testing activation
python manage.py runserver
```

Server runs at `http://localhost:8000`. Django admin at `/admin/`. API at `/api/`.

OTP codes (registration + password reset) print to this console/terminal —
there's no real email provider configured by default (`EMAIL_BACKEND` falls
back to Django's console backend). Set `EMAIL_HOST`/`EMAIL_HOST_USER`/
`EMAIL_HOST_PASSWORD` in `.env` to send real email.

## Key endpoints

- `POST /api/auth/register/`, `/verify-email/`, `/resend-otp/`, `/login/`, `/logout/`, `/forgot-password/`, `/reset-password/`, `/change-password/`, `/me/`, `/token/refresh/`
- `GET/PATCH /api/profiles/me/`, `POST /api/profiles/me/avatar/`
- `/api/profiles/social-links/`, `/api/profiles/custom-links/`, `/api/profiles/custom-fields/` (full CRUD + `/reorder/`)
- `GET /api/profiles/public/<username>/` (public)
- `GET /api/nfc/cards/mine/`, `POST /api/nfc/cards/activate/`, `POST /api/nfc/cards/<id>/activate-assigned/`, `GET /api/nfc/cards/<identifier>/` (public resolve)

## Tests

```bash
python manage.py test
```

(Automated test coverage is part of the Phase B backlog — the flows above
have been verified manually end-to-end, including cross-user access
rejection, but no `tests.py` assertions exist yet.)
