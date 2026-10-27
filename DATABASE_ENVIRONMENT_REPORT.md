# Database Environment Report

How the NFC Card backend keeps **local development** on SQLite and **production on Render** on PostgreSQL, so local test data never reaches live users, NFC cards, orders or payments.

> No passwords, database URLs or other secrets appear in this report. Placeholders like `<RENDER_DATABASE_URL>` mark where real values go.

---

## 1. Summary

| | Local development | Production (Render) |
|---|---|---|
| `DJANGO_ENV` | `development` (in your local `.env`) | `production` (Render environment) |
| Database | SQLite: `backend/db.sqlite3` | PostgreSQL, from Render's `DATABASE_URL` |
| `DATABASE_URL` | **Ignored**, even if set | **Required**: the app will not start without it |
| If something is misconfigured | Still SQLite, never the live database | Startup stops with a clear error, never a silent switch to SQLite |

Frontend: the local React app (`frontend/frontend_demo/.env`) calls `http://localhost:8000/api`, so local frontend → local backend → local SQLite. The Vercel frontend calls the Render backend, which uses PostgreSQL. Nothing in the frontend changed.

---

## 2. Original configuration and risks

**Before**, `config/settings.py` chose the database like this:

- If `DATABASE_URL` had any value → use that database (whatever it was).
- If it was empty → use local SQLite.

**Risks identified**

1. **The local backend could silently use the live database.** One line in `backend/.env` decided it. At one point the local `.env` held the live Render URL, so every local signup, test order or admin edit would have been written to production.
2. **Production could silently fall back to SQLite.** If `DATABASE_URL` went missing on Render, Django would quietly create an empty SQLite file on Render's temporary disk. The site would look "up" with no data, and anything written would be lost on the next deploy.
3. **Live credentials in local files.** `backend/.env.postgres` holds a full PostgreSQL URL with password. It is git-ignored, but it is still a live secret on disk (see section 12).
4. **Migrations run automatically on deploy.** `build.sh` runs `python manage.py migrate` on every Render build. This is existing behaviour and was **not changed** (see section 9).

---

## 3. Files changed

| File | Change | Why |
|---|---|---|
| `config/settings.py` | Database block now chosen by `DJANGO_ENV`; added import of `ImproperlyConfigured` | Explicit dev/prod selection; prod fails safely instead of falling back to SQLite |
| `render.yaml` | Added `DJANGO_ENV=production` env var | Makes the production choice explicit in the deploy config |
| `.env.example` | Documents `DJANGO_ENV=development` | So a fresh local setup starts safely |
| `.env` (local only, git-ignored) | Added `DJANGO_ENV=development`; emptied `DATABASE_URL` (the live Render URL was removed) | Local work always uses SQLite; no live credentials in the active local config |
| `DATABASE_ENVIRONMENT_REPORT.md` | New (this file) | Documentation |

**Not changed:** `requirements.txt` (`psycopg2-binary` and `dj-database-url` were already there), any app, model, serializer, view, URL, migration file, authentication, Google OAuth, password reset, Razorpay, Brevo/SMTP, Cloudinary, CORS/CSRF, `build.sh`, `.gitignore` (it already ignores `.env` and `.env.*`), or anything in `frontend/`.

---

## 4. Final database configuration (how it works)

From `config/settings.py`:

```python
DJANGO_ENV = os.environ.get("DJANGO_ENV", "").strip().lower()
if not DJANGO_ENV:
    DJANGO_ENV = "production" if env_bool("RENDER") else "development"
if DJANGO_ENV not in ("development", "production"):
    raise ImproperlyConfigured(...)

if DJANGO_ENV == "production":
    DATABASE_URL = os.environ.get("DATABASE_URL", "").strip()
    if not DATABASE_URL:
        raise ImproperlyConfigured("DJANGO_ENV=production requires DATABASE_URL ...")
    DATABASES = {"default": dj_database_url.parse(
        DATABASE_URL, conn_max_age=600, conn_health_checks=True)}
    if DATABASES["default"]["ENGINE"] != "django.db.backends.postgresql":
        raise ImproperlyConfigured("DJANGO_ENV=production requires a PostgreSQL DATABASE_URL.")
else:
    DATABASES = {"default": {"ENGINE": "django.db.backends.sqlite3",
                             "NAME": BASE_DIR / "db.sqlite3"}}
```

In plain English:

1. Django reads `DJANGO_ENV`.
2. If `DJANGO_ENV` is not set at all, it checks for `RENDER=true`, a variable Render automatically sets on every service. On Render that means production; on your computer it means development. **Your current Render deploy keeps using PostgreSQL even before you add `DJANGO_ENV` there.**
3. **Development** always uses `db.sqlite3` and never looks at `DATABASE_URL`.
4. **Production** must have a PostgreSQL `DATABASE_URL`, or Django refuses to start.
5. Production connection settings are unchanged (`conn_max_age=600`, `conn_health_checks=True`). Any SSL option in Render's URL (for example `?sslmode=require`) is still applied, as before.

---

## 5. Local `.env` setup (no real secrets)

In `backend/.env`:

```env
DJANGO_ENV=development
DATABASE_URL=
```

Leave `DATABASE_URL` empty. Even if something is put there by mistake, development mode ignores it. All other variables (Cloudinary, Brevo, Google OAuth, JWT, CORS, and so on) stay as they were.

Never commit `.env`. It is already in `.gitignore`.

---

## 6. Required Render environment variables

In Render → your backend web service → **Environment**:

| Variable | Value | Notes |
|---|---|---|
| `DJANGO_ENV` | `production` | **Add this manually** (recommended; see note below) |
| `DATABASE_URL` | `<RENDER_DATABASE_URL>` | Already set. Do not change it. Use the **Internal** Database URL for the web service |
| `SECRET_KEY`, `DEBUG=False`, `ALLOWED_HOSTS`, `FRONTEND_URL`, `CORS_ALLOWED_ORIGINS`, `CSRF_TRUSTED_ORIGINS`, `CLOUDINARY_*`, `BREVO_*`, `GOOGLE_OAUTH_*`, email, Razorpay keys | existing values | Unchanged |

Note: the `render.yaml` change only applies if your service is synced from a Render Blueprint. The database name in `render.yaml` (`nexora-db`) differs from the one you shared, so your live service may have been set up manually. Add `DJANGO_ENV=production` in the dashboard to be sure. Even without it, the `RENDER=true` fallback keeps production on PostgreSQL.

---

## 7. Running the local backend (PowerShell)

```powershell
cd C:\Users\yalag\OneDrive\Desktop\NFC_Project\backend
pip install -r requirements.txt
python manage.py check
python manage.py runserver
```

Then start the frontend in another terminal (`frontend/frontend_demo`, `npm run dev`). It already points at `http://localhost:8000/api`.

---

## 8. Verifying the setup

### Local: confirm SQLite is active

```powershell
python manage.py shell -c "from django.db import connection; print('Engine:', connection.settings_dict['ENGINE']); print('Database:', connection.settings_dict['NAME'])"
```

Expected: `Engine: django.db.backends.sqlite3` and a path ending in `backend\db.sqlite3`.

### Production configuration: check safely, without connecting

These only read settings, and the fake host `example.invalid` cannot reach any real server:

```powershell
# Must FAIL with "requires DATABASE_URL"
$env:DJANGO_ENV="production"; python manage.py check; Remove-Item Env:DJANGO_ENV

# Must print django.db.backends.postgresql
$env:DJANGO_ENV="production"; $env:DATABASE_URL="postgresql://u:p@example.invalid/x"
python manage.py shell -c "from django.conf import settings as s; print(s.DATABASES['default']['ENGINE'])"
Remove-Item Env:DJANGO_ENV; Remove-Item Env:DATABASE_URL
```

Always run the `Remove-Item` lines afterwards, or close the terminal, so the terminal goes back to development mode.

### Production: real check (manual, on Render)

In the Render dashboard → backend service → **Shell** (if available on your plan):

```bash
python manage.py shell -c "from django.db import connection; print(connection.settings_dict['ENGINE'], connection.settings_dict['NAME'])"
```

Expected: `django.db.backends.postgresql` and your production database name. Also open the live site and confirm existing users and orders are still visible.

### Results of the automated checks run for this change (on the local machine)

| # | Check | Result |
|---|---|---|
| 1 | `python manage.py check` | No issues |
| 2 | Local engine/database | `sqlite3`, `backend\db.sqlite3` ✅ |
| 3 | Development + a stray Postgres `DATABASE_URL` | Still `sqlite3` ✅ |
| 4 | Production, no `DATABASE_URL` | Stops with `ImproperlyConfigured` ✅ |
| 5 | Production, SQLite URL | Stops with `ImproperlyConfigured` ✅ |
| 6 | Production, Postgres URL (fake host) | `postgresql` ✅ |
| 7 | `RENDER=true`, `DJANGO_ENV` empty (like Render) | `production` / `postgresql` ✅ |
| 8 | `RENDER=true`, no `DATABASE_URL` | Stops with an error, does **not** use SQLite ✅ |
| 9 | Invalid `DJANGO_ENV=staging` | Stops with a clear error ✅ |
| 10 | Local unapplied migrations (`showmigrations`) | 0 |
| 11 | Full test suite (287 tests) | 270 pass; **10 failures, 7 errors**, all in `orders` (order creation returns 400) and `website_content` (`GeneralSettingsPublicViewTests`). **The original settings give exactly the same failures**, so they existed before this change and are unrelated to the database setup. |

**Production itself was not tested.** No command connected to the Render database during this change.

---

## 9. Migrations: development vs production

**Development (safe, local only):**

```powershell
python manage.py makemigrations     # when you change a model
python manage.py showmigrations     # read-only status
python manage.py migrate            # applies to local db.sqlite3 only
```

**Production:**
- `build.sh` runs `python manage.py migrate` automatically on **every Render deploy**. So any migration file you commit and push to the deployed branch (`backend`) is applied to the live database on the next deploy.
- Before pushing a new migration, run it locally first and read it. Be very careful with any migration that deletes or renames fields or tables.
- If you would rather apply production migrations by hand, remove the `migrate` line from `build.sh` and run it from the Render Shell instead. This was **not** changed; it's your decision.
- Never edit or delete migration files that have already been applied in production.

---

## 10. Avoiding accidental connection to production

- Keep `DJANGO_ENV=development` in your local `.env`. Never set it to `production` there.
- Do not paste the Render database URL into `backend/.env`. Development ignores it anyway, but keeping it out removes the risk entirely.
- The only way your computer can reach the live database is if you deliberately set `DJANGO_ENV=production` **and** a real `DATABASE_URL` in your terminal. Only do this for a specific, planned task (for example creating the production superuser, below), then close the terminal.
- Before any important command, run the "confirm SQLite is active" command in section 8.

### Creating a production superuser (only when you decide to)

The preferred way is the Render dashboard → backend service → **Shell** → `python manage.py createsuperuser`. If Shell is not available on your plan, from your computer:

```powershell
$env:DJANGO_ENV="production"
$env:DATABASE_URL="<RENDER_EXTERNAL_DATABASE_URL>?sslmode=require"
python manage.py shell -c "from django.db import connection as c; print(c.settings_dict['HOST'], c.settings_dict['NAME'])"   # confirm target first
python manage.py createsuperuser
Remove-Item Env:DJANGO_ENV; Remove-Item Env:DATABASE_URL
```

This writes to the live database. Check the printed host and database name before continuing.

---

## 11. Testing features without affecting live users or orders

With `DJANGO_ENV=development`, everything you do locally (signup, login, Google login, NFC cards, customers, cart, orders, admin) is stored in `backend/db.sqlite3` only.

Things that still reach **real external services** from local development, because they use their own keys rather than the database:
- **Cloudinary:** local image uploads go to the same Cloudinary account configured in `.env`.
- **Brevo:** if `BREVO_API_KEY` is set locally, password-reset emails are really sent.
- **Razorpay:** use **test mode** keys locally, never live keys, so no real money moves.
- **Google OAuth:** uses the client ID in `.env`.

Use test accounts and test email addresses locally. `python manage.py test` uses its own temporary test database and does not touch `db.sqlite3` or production.

---

## 12. Limitations, assumptions and manual steps

**Manual steps for you**
1. **Add `DJANGO_ENV=production`** in Render → backend service → Environment (recommended, see section 6).
2. **Rotate the Render database password.** A production database URL was shared in a chat conversation, so treat it as exposed. Reset credentials in Render, then update `DATABASE_URL` on the Render web service if it isn't linked automatically.
3. **Confirm which database is live.** The URL in `backend/.env.postgres` names a different database from the one shared in chat, and `render.yaml` names a third (`nexora-db`). The Render web service's `DATABASE_URL` is the source of truth.
4. **Consider deleting `backend/.env.postgres`**, or moving it to a password manager. It holds live credentials and is no longer needed for local development.
5. **Review, commit and push** these changes yourself when ready. Nothing was committed, pushed or deployed. Render deploys from the `backend` branch.

**Assumptions and limitations**
- Render sets `RENDER=true` on all services (documented Render behaviour). This fallback is only a safety net; the explicit `DJANGO_ENV=production` is preferred.
- `DEBUG` is still controlled separately by the `DEBUG` variable (default `True` if unset). `render.yaml` sets `DEBUG=False`; confirm it is `False` in the Render dashboard.
- Version mismatch: your local machine has Django **5.1.8** installed, but `requirements.txt` pins **6.0.1** (what Render installs). Run `pip install -r requirements.txt` locally so you test the same version production runs.
- The 17 failing tests in `orders` and `website_content` existed before this change and should be looked at separately.
- Production behaviour was verified only by simulating its settings locally. No connection to the live database was made.
