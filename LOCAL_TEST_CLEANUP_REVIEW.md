# Reviewed local test-data cleanup (generated, not executed)

No cleanup, sequence reset, backup, or cleanup-helper preview has been executed by the assistant. Inspection used a read-only SQLite connection. The helper was checked for Python syntax and its table names were compared with the real schema; its execution path has **not** been run or transaction-tested.

Helper: `local_test_cleanup_review.py`, loaded manually from the Django shell.

## Scope and selection

The inspected database is `backend/db.sqlite3`. At inspection it contained 5 accounts: 2 staff superusers with role ADMIN and 3 CUSTOMER accounts. Those three customers are **unclassified**, not automatically assumed to be test accounts. There is no reliable test-data flag or service-account flag in the current models.

Select individual IDs after reviewing identities and related data. Never replace the allowlists with “all non-superusers” or “all customers.” Add unflagged service/automation accounts to `KEEP_USER_IDS`.

The helper automatically protects non-CUSTOMER roles, staff, superusers, accounts with groups or explicit permissions, and accounts referenced by protected CMS/audit/report/testimonial tables. It also protects their owned records. All unselected records are retained and checksummed.

Deleting an explicitly selected test account includes its owned orders, profiles and dependent business rows. An order's items, recipients and transactions are included. Cards, checkout sessions, JWT records and tap events linked by reviewed ownership relations are included as well. A recipient associated with a different, retained order blocks deletion rather than silently changing that order.

Anonymous/unowned checkout attempts, verification challenges, inventory cards, detached tokens and analytics events require their own reviewed IDs. Matching a name, email, payment provider or an account role is not used as proof that a row is test data.

## Exact tables eligible for selective cleanup (31)

These are not wholesale truncate targets. Only approved rows and their displayed owned dependencies are deleted. A table can remain nonempty when it contains retained records.

```text
accounts_customeronboarding
accounts_emailotp
accounts_user
analytics_tapevent
customer_addresses_customeraddress
customer_analytics_analyticsevent
customer_cart_cart
customer_cart_cartitem
customer_leads_lead
customer_notifications_notification
customer_orders_order
customer_orders_orderitem
customer_orders_orderstatushistory
customer_qr_codes_customerqrcode
customer_services_customerservice
customer_settings_customersettings
nfc_cards_nfccard
orders_order
orders_orderitem
orders_orderrecipient
orders_transaction
payments_checkoutsession
payments_checkoutverification
profiles_customfield
profiles_customlink
profiles_profile
profiles_sociallink
support_supportticket
support_ticketmessage
token_blacklist_blacklistedtoken
token_blacklist_outstandingtoken
```

`accounts_user` is selectively cleaned. Preserved admin/staff/service/other retained accounts prevent resetting its sequence to 1. The separate legacy `customer_orders_*` tables also exist and are included; `reviews_review` does not exist in the current migrated schema.

## Exact protected tables (50)

No rows, sequence values or stored media references in these tables may change. Unknown/new tables are protected automatically too.

```text
accounts_user_groups
accounts_user_user_permissions
auth_group
auth_group_permissions
auth_permission
customer_notifications_announcement
django_admin_log
django_content_type
django_migrations
django_session
reports_generatedreport
testimonials_testimonial
website_content_aboutbuiltfromexperience
website_content_aboutfeaturehighlight
website_content_aboutmission
website_content_aboutpage
website_content_aboutwhychoose
website_content_company
website_content_contactmessage
website_content_contactmessagereply
website_content_emailsettings
website_content_faq
website_content_feature
website_content_featuresanalyticssection
website_content_featurescta
website_content_featurespagecard
website_content_featurespagesettings
website_content_featuresshowcasesection
website_content_generalsettings
website_content_homebottombaritem
website_content_homecta
website_content_homehero
website_content_homeherofeaturehighlight
website_content_homehowitfeels
website_content_homehowitfeelspoint
website_content_homeourstory
website_content_howitworksstep
website_content_ordercardpagesettings
website_content_ordercardproduct
website_content_ordercardproductfeature
website_content_ordercardproductimage
website_content_ordercardproductoffer
website_content_ordercardproducttimelinestage
website_content_ordercardtrustbadge
website_content_paymentsettings
website_content_profiletemplatepreview
website_content_securitysettings
website_content_shippingsettings
website_content_statistic
website_content_value
```

`sqlite_sequence` has special treatment: the helper removes only sequence entries for allowlisted AUTOINCREMENT tables confirmed empty inside the cleanup transaction. Entries for protected or nonempty tables are preserved. It never renumbers surviving rows.

All local media files and Cloudinary assets remain untouched. Deleting a test profile/QR database row can leave its hosted asset unreferenced; asset deletion is deliberately excluded.

## Inspected dependency and integration risks

- `orders.Order.customer` uses PROTECT. Selected test-account orders must be removed before their account. Order items, recipients and transactions cascade from their parent order.
- User-owned profiles, social/custom fields and links, QR records, addresses, settings, services, carts, notifications, leads, support tickets/messages, and legacy customer orders have CASCADE dependencies. The preview expands these explicitly and shows their IDs.
- Card owners, checkout links, recipient links, onboarding source orders, analytics references and outstanding JWT owners include SET_NULL dependencies. The script collects the approved ownership paths and blocks any remaining cross-reference; it does not null surviving records.
- `testimonials.Testimonial.customer` uses CASCADE. Its `post_delete` receiver schedules Cloudinary image destruction with `transaction.on_commit()`. All testimonials and their owners are therefore protected here. A selected order referenced by a retained testimonial also blocks cleanup.
- Announcements, contact-message replies, generated reports and admin audit entries retain authorship links. Their associated accounts are protected.
- Order/card/legacy-order save signals create notifications; order creation also queues confirmation mail. The generated helper uses narrowly scoped SQL with foreign keys enabled and an explicit dependency order, so it never calls model save/delete methods or Django signals. It does not import or call Cloudinary, Brevo or Razorpay APIs.
- The inspected SQLite database has no triggers. The helper refuses a database with triggers or preexisting foreign-key violations.
- Existing `reset_dev_data` is unsuitable for this request: it broadly selects non-admin accounts, retains card inventory, does not reset sequences, has only a DEBUG guard, and can reach the testimonial deletion signal through user cascades. Do not run it for this cleanup.
- An ID reset can reuse old numeric identifiers. Old local URLs, exports or card references can then refer to different test records. Public random order numbers, card UIDs, usernames and UUID/token values are not auto-increment counters and are not reset by this script.

## 1. Start the local Django shell manually

Stop the local Django server, frontend activity and background jobs until cleanup and verification finish. The helper also takes a SQLite write lock during deletion and refuses a changed approval digest.

From PowerShell, in `backend`:

```powershell
$env:DJANGO_ENV = "development"
python manage.py shell -i python
```

The helper independently refuses PostgreSQL, a non-development environment, a Render deployment, a missing/symlinked DB, or any DB path other than the existing `db.sqlite3` beside the helper. It never deletes or recreates that file, runs migrations, or invokes flush.

## 2. Copy-paste-ready read-only inventory and preview

Paste into that Python shell. The empty defaults intentionally select nothing:

```python
import local_test_cleanup_review as cleanup
cleanup.inventory()

cleanup.TEST_USER_IDS = ()                 # Fill only reviewed test customer IDs.
cleanup.TEST_ORDER_IDS = ()                # Optional additional reviewed test orders.
cleanup.TEST_CARD_IDS = ()                 # Include reviewed unassigned test inventory.
cleanup.TEST_CHECKOUT_SESSION_IDS = ()     # Include reviewed anonymous/failed test attempts.
cleanup.TEST_CHECKOUT_VERIFICATION_IDS = () # Include reviewed test OTP challenges.
cleanup.KEEP_USER_IDS = ()                 # Add every unflagged service/automation account.
cleanup.EXTRA_TEST_ROWS = {}               # Example: {"analytics.TapEvent": (12, 13)}.

plan = cleanup.preview()
```

To review IDs before filling the allowlists, these are additional read-only shell queries; they do not expose passwords, OTP hashes or payment secrets:

```python
from django.apps import apps
list(apps.get_model("orders.Order").objects.values("id", "customer_id", "purchaser_name", "purchaser_email", "payment_status"))
list(apps.get_model("nfc_cards.NfcCard").objects.values("id", "user_id", "serial_number", "status"))
list(apps.get_model("payments.CheckoutSession").objects.values("id", "customer_id", "order_id", "email", "provider", "status"))
list(apps.get_model("payments.CheckoutVerification").objects.values("id", "channel", "destination", "created_at"))
list(apps.get_model("analytics.TapEvent").objects.values("id", "customer_id", "card_id", "action"))
list(apps.get_model("token_blacklist.OutstandingToken").objects.values("id", "user_id", "created_at", "expires_at"))
```

After changing any selection, run `plan = cleanup.preview()` again. Review **every selected ID**, remaining row counts, proposed sequence resets, automatically protected users and all blockers. Never resolve a blocker by blindly adding a retained record's ID. Retain the test account/order/card when its removal would affect important website or real-customer data.

## 3. Copy-paste-ready execution command (manual approval only)

Only after reviewing the populated preview, in the **same shell**:

```python
receipt = cleanup.execute(plan["digest"])
```

It additionally requires typing this exact confirmation interactively:

```text
DELETE REVIEWED LOCAL TEST DATA
```

The command creates a uniquely named SQLite online backup beside the original DB, checks the unchanged approved plan under `BEGIN IMMEDIATE`, deletes only the planned IDs in child-before-parent order, resets only confirmed-empty allowlisted sequences, and verifies retained row hashes and foreign keys before committing. An error before commit rolls back database changes; the backup remains available. No transaction or deletion path in this helper has been executed by the assistant.

## 4. Copy-paste-ready verification commands

Immediately, before restarting servers or creating any new records:

```python
cleanup.verify(receipt)
```

This reads every table and compares it with the committed receipt, confirms reset sequence entries are absent and prints each cleanup table's row count, sequence value and predicted next integer ID. Empty/reset tables should show `rows=0`, `sequence=None`, `next integer ID=1`. A table retaining admin/service/non-test data should remain nonempty and its ID sequence is intentionally not reset.

For a compact read-only check of the three main ID counters:

```python
db = cleanup._open()
try:
    for table in ("orders_order", "orders_transaction", "nfc_cards_nfccard"):
        count = db.execute(f'SELECT COUNT(*) FROM "{table}"').fetchone()[0]
        sequence = db.execute("SELECT seq FROM sqlite_sequence WHERE name = ?", (table,)).fetchone()
        print(table, "rows=", count, "sequence=", sequence)
finally:
    db.close()
```

`rows=0` and `sequence=None` mean SQLite will choose ID 1 for the next automatically allocated integer PK in that empty table. No probe inserts are needed. Do not expect the users table, shared authentication tables, or any partially retained table to restart at 1.
