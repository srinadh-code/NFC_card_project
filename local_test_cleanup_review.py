"""Review-only cleanup helper. Importing this file never opens or changes a DB.

Use from `python manage.py shell -i python`. Fill explicit test IDs below,
then call inventory(), preview(), execute(plan['digest']), and verify(receipt).
The assistant must not run execute(); it is exclusively for manual review/use.
"""
import hashlib
import json
import os
import sqlite3
import tempfile
from collections import defaultdict
from datetime import datetime, timezone
from graphlib import TopologicalSorter
from pathlib import Path

from django.apps import apps
from django.conf import settings


# REQUIRED REVIEW: an account is not test data just because it is a CUSTOMER.
# Select IDs only after checking their identity and ALL their related records.
TEST_USER_IDS = ()
TEST_ORDER_IDS = ()
TEST_CARD_IDS = ()
TEST_CHECKOUT_SESSION_IDS = ()
TEST_CHECKOUT_VERIFICATION_IDS = ()

# Add unflagged service/automation accounts here, even if role=CUSTOMER.
KEEP_USER_IDS = ()

# Optional explicit selections, e.g. {"analytics.TapEvent": (12, 13)}.
# Useful for anonymous events/guest sessions and test data belonging to a
# retained account. Only the models in CLEANABLE_LABELS are accepted.
EXTRA_TEST_ROWS = {}

CONFIRMATION = "DELETE REVIEWED LOCAL TEST DATA"
EXPECTED_DB = Path(__file__).resolve().with_name("db.sqlite3")
CLEANABLE_LABELS = (
    "accounts.User", "accounts.EmailOTP", "accounts.CustomerOnboarding",
    "orders.Order", "orders.OrderItem", "orders.OrderRecipient", "orders.Transaction",
    "payments.CheckoutSession", "payments.CheckoutVerification", "nfc_cards.NfcCard",
    "profiles.Profile", "profiles.SocialLink", "profiles.CustomLink", "profiles.CustomField",
    "analytics.TapEvent", "support.SupportTicket", "support.TicketMessage",
    "customer_qr_codes.CustomerQrCode", "customer_analytics.AnalyticsEvent",
    "customer_orders.Order", "customer_orders.OrderItem", "customer_orders.OrderStatusHistory",
    "customer_leads.Lead", "customer_notifications.Notification",
    "customer_settings.CustomerSettings", "customer_services.CustomerService",
    "customer_addresses.CustomerAddress", "customer_cart.Cart", "customer_cart.CartItem",
    "token_blacklist.OutstandingToken", "token_blacklist.BlacklistedToken",
)

# These are intentional test-data ownership links, including SET_NULL links
# that would otherwise leave payment attempts, cards, analytics or JWTs behind.
# Do NOT follow recipient.user/profile/card links into somebody else's order:
# a surviving cross-order allocation instead blocks cleanup for review.
FOLLOW_LINKS = {
    ("orders_order", "customer_id"),
    ("nfc_cards_nfccard", "user_id"),
    ("payments_checkoutsession", "customer_id"),
    ("payments_checkoutsession", "order_id"),
    ("analytics_tapevent", "customer_id"),
    ("analytics_tapevent", "card_id"),
    ("token_blacklist_outstandingtoken", "user_id"),
}


def _quote(name):
    return '"' + name.replace('"', '""') + '"'


def _guard():
    config = settings.DATABASES["default"]
    if config["ENGINE"] != "django.db.backends.sqlite3" or settings.DJANGO_ENV != "development":
        raise RuntimeError("Refusing: requires the development SQLite database.")
    if os.environ.get("RENDER", "").strip().lower() in {"1", "true", "yes", "on"}:
        raise RuntimeError("Refusing: RENDER marks this as a deployment environment.")
    actual = Path(str(config["NAME"]))
    if EXPECTED_DB.is_symlink() or not EXPECTED_DB.is_file():
        raise RuntimeError("Refusing: expected db.sqlite3 is missing or is a symbolic link.")
    if actual.resolve() != EXPECTED_DB or Path(settings.BASE_DIR).resolve() != EXPECTED_DB.parent:
        raise RuntimeError(f"Refusing unexpected database path: {actual}")
    return EXPECTED_DB


def _open(readonly=True):
    db = sqlite3.connect(_guard().as_uri() + ("?mode=ro" if readonly else "?mode=rw"), uri=True,
                         timeout=10, isolation_level=None)
    db.execute("PRAGMA foreign_keys=ON")
    if readonly:
        db.execute("PRAGMA query_only=ON")
    return db


def _schema(db):
    rows = db.execute("SELECT type,name,tbl_name,sql FROM sqlite_master ORDER BY type,name").fetchall()
    tables = {row[1]: row[3] or "" for row in rows if row[0] == "table"}
    if any(row[0] == "trigger" for row in rows):
        raise RuntimeError("Refusing unreviewed database triggers.")
    if db.execute("PRAGMA foreign_key_check").fetchall():
        raise RuntimeError("Existing foreign-key violations must be reviewed first.")
    return rows, tables


def _models():
    return {apps.get_model(label)._meta.db_table: apps.get_model(label) for label in CLEANABLE_LABELS}


def _relations(db, tables):
    # Inspect real SQLite constraints as well as the current Django on_delete
    # policy. Unknown tables remain protected; no schema is silently ignored.
    policies = {}
    for model in apps.get_models(include_auto_created=True):
        for field in model._meta.fields:
            if field.is_relation and field.remote_field:
                key = (model._meta.db_table, field.column, field.related_model._meta.db_table)
                policies[key] = field.remote_field.on_delete.__name__
    relations = []
    for table in sorted(tables):
        for foreign_key in db.execute(f"PRAGMA foreign_key_list({_quote(table)})"):
            _, _, parent, column, target, _, _, _ = foreign_key
            if target != "id":
                raise RuntimeError(f"Unreviewed foreign key: {table}.{column} -> {parent}.{target}")
            relations.append((table, column, parent, policies.get((table, column, parent), "UNKNOWN")))
    return relations


def _count(db, table):
    return db.execute(f"SELECT COUNT(*) FROM {_quote(table)}").fetchone()[0]


def _ids(values):
    values = tuple(values)
    if any(type(value) is not int or value <= 0 for value in values):
        raise ValueError("Every selected ID must be a positive integer.")
    return set(values)


def _references(db, table, column, parent_ids):
    found = set()
    values = sorted(parent_ids)
    for offset in range(0, len(values), 500):
        batch = values[offset:offset + 500]
        parameters = ",".join("?" for _ in batch)
        found.update(row[0] for row in db.execute(
            f"SELECT id FROM {_quote(table)} WHERE {_quote(column)} IN ({parameters})", batch
        ))
    return found


def _protected_users(db, tables, relations, cleanable):
    reasons = defaultdict(set)
    for user_id, role, staff, superuser in db.execute("SELECT id,role,is_staff,is_superuser FROM accounts_user"):
        if role != "CUSTOMER" or staff or superuser:
            reasons[user_id].add("admin/staff/superuser/non-customer role")
    for user_id in _ids(KEEP_USER_IDS):
        reasons[user_id].add("explicit KEEP_USER_IDS service/retained account")
    # Group membership, explicit permissions, CMS authorship, testimonials,
    # admin audit entries and generated-report history protect their accounts.
    for table, column, parent, _ in relations:
        if parent == "accounts_user" and table not in cleanable:
            for (user_id,) in db.execute(
                f"SELECT DISTINCT {_quote(column)} FROM {_quote(table)} WHERE {_quote(column)} IS NOT NULL"
            ):
                reasons[user_id].add(f"referenced by protected table {table}")
    return {key: sorted(value) for key, value in reasons.items()}


def _protected_owned_rows(db, relations, cleanable, protected_users):
    protected = {table: set() for table in cleanable}
    protected["accounts_user"] = set(protected_users)
    while True:
        changed = False
        for child, column, parent, policy in relations:
            if child not in protected or parent not in protected or not protected[parent]:
                continue
            if parent != "accounts_user" and policy != "CASCADE" and (child, column) not in FOLLOW_LINKS:
                continue
            found = _references(db, child, column, protected[parent]) - protected[child]
            if found:
                protected[child].update(found)
                changed = True
        if not changed:
            return protected


def _fingerprint(db, tables, omitted=None, omitted_sequences=()):
    omitted = omitted or {}
    omitted_sequences = set(omitted_sequences)
    result = {}
    for table in sorted(tables):
        columns = [row[1] for row in db.execute(f"PRAGMA table_info({_quote(table)})")]
        order = ",".join(_quote(column) for column in columns)
        pk_index = columns.index("id") if table in omitted else None
        name_index = columns.index("name") if table == "sqlite_sequence" else None
        digest, count = hashlib.sha256(), 0
        for row in db.execute(f"SELECT * FROM {_quote(table)} ORDER BY {order}"):
            if pk_index is not None and row[pk_index] in omitted[table]:
                continue
            if name_index is not None and row[name_index] in omitted_sequences:
                continue
            packed = json.dumps(row, ensure_ascii=True, default=lambda value: {"bytes": value.hex()}).encode()
            digest.update(len(packed).to_bytes(8, "big") + packed)
            count += 1
        result[table] = {"count": count, "sha256": digest.hexdigest()}
    return result


def _plan(db):
    schema, tables = _schema(db)
    models = _models()
    if set(models) - set(tables):
        raise RuntimeError("Model tables are missing; review migrations without running cleanup.")
    relations = _relations(db, tables)
    chosen = {table: set() for table in models}
    roots = {
        "accounts.User": TEST_USER_IDS, "orders.Order": TEST_ORDER_IDS,
        "nfc_cards.NfcCard": TEST_CARD_IDS, "payments.CheckoutSession": TEST_CHECKOUT_SESSION_IDS,
        "payments.CheckoutVerification": TEST_CHECKOUT_VERIFICATION_IDS,
    }
    for label, values in EXTRA_TEST_ROWS.items():
        if label not in CLEANABLE_LABELS:
            raise ValueError(f"Cannot select protected/unknown model: {label}")
        roots[label] = set(roots.get(label, ())) | _ids(values)
    for label, values in roots.items():
        table = apps.get_model(label)._meta.db_table
        values = _ids(values)
        found = _references(db, table, "id", values)
        if values - found:
            raise ValueError(f"Missing IDs in {table}: {sorted(values - found)}")
        chosen[table].update(values)
    protected_users = _protected_users(db, tables, relations, models)
    problems = []
    while True:
        changed = False
        for child, column, parent, policy in relations:
            if parent not in chosen or not chosen[parent] or child not in chosen:
                continue
            if policy != "CASCADE" and (child, column) not in FOLLOW_LINKS:
                continue
            found = _references(db, child, column, chosen[parent]) - chosen[child]
            if found:
                chosen[child].update(found)
                changed = True
        if not changed:
            break
    owned_protection = _protected_owned_rows(db, relations, models, protected_users)
    for table, protected_ids in owned_protection.items():
        affected = chosen[table] & protected_ids
        if affected:
            problems.append({"protected_account_data_selected": table, "affected_ids": sorted(affected)})
    # No surviving row may be deleted, nulled or otherwise changed as a side
    # effect. This also catches PROTECT, shared recipients and protected CMS.
    for child, column, parent, policy in relations:
        if parent in chosen and chosen[parent]:
            surviving = _references(db, child, column, chosen[parent]) - chosen.get(child, set())
            if surviving:
                problems.append({"retained_table": child, "field": column, "on_delete": policy,
                                 "affected_ids": sorted(surviving)})
    reset = [table for table in models if _count(db, table) == len(chosen[table])
             and "AUTOINCREMENT" in tables[table].upper()]
    graph = {table: set() for table in models}
    for child, _, parent, _ in relations:
        if parent in graph and child in graph:
            graph[parent].add(child)
    deletion_order = list(TopologicalSorter(graph).static_order())
    before = _fingerprint(db, tables)
    serial_chosen = {table: sorted(values) for table, values in sorted(chosen.items())}
    digest = hashlib.sha256(json.dumps({"schema": schema, "before": before, "chosen": serial_chosen,
                                       "reset": sorted(reset), "protected_users": protected_users}, sort_keys=True).encode()).hexdigest()
    return {"database": str(EXPECTED_DB), "digest": digest, "selected": serial_chosen,
            "reset_tables": sorted(reset), "delete_order": deletion_order, "blockers": problems,
            "protected_users": protected_users, "protected_tables": sorted(set(tables) - set(models) - {"sqlite_sequence"}),
            "before": before, "preserved": _fingerprint(db, tables, chosen, reset)}


def inventory():
    """Read-only inventory. Never labels a customer as test data automatically."""
    db = _open()
    try:
        _, tables = _schema(db)
        models = _models()
        protected = _protected_users(db, tables, _relations(db, tables), models)
        print("LOCAL DATABASE:", EXPECTED_DB)
        print("ACCOUNTS: id, email, name, role, staff, superuser, automatic protection")
        for row in db.execute("SELECT id,email,full_name,role,is_staff,is_superuser FROM accounts_user ORDER BY id"):
            print(row, protected.get(row[0], ["UNCLASSIFIED: retain unless explicitly confirmed test-only"]))
        print("\nCLEANABLE TABLES (only explicitly reviewed rows and their owned dependencies):")
        for table, model in sorted(models.items()):
            print(model._meta.label, table, _count(db, table))
        print("\nPROTECTED TABLES:")
        for table in sorted(set(tables) - set(models) - {"sqlite_sequence"}):
            print(table, _count(db, table))
    finally:
        db.close()


def preview():
    """SELECT/PRAGMA reads only; no deletion, backup, signals or external calls."""
    db = _open()
    try:
        plan = _plan(db)
    finally:
        db.close()
    print("DRY RUN ONLY:", plan["database"])
    for table, ids in plan["selected"].items():
        print(f"{table}: delete {len(ids)}, retain {plan['before'][table]['count'] - len(ids)}; IDs={ids}")
    print("EMPTY TABLES ELIGIBLE FOR SEQUENCE RESET:", plan["reset_tables"])
    print("PROTECTED USERS:", plan["protected_users"])
    print("BLOCKERS / RETAINED RECORDS AFFECTED:", json.dumps(plan["blockers"], indent=2))
    print("APPROVAL DIGEST:", plan["digest"])
    print("No rows selected; execution will refuse." if not any(plan["selected"].values()) else "Review every selected row and all blockers before approval.")
    return plan


def execute(approved_digest):
    """MANUAL USE ONLY: backup, recheck the approved plan, then atomic cleanup.

    Uses narrowly scoped SQL, not ORM delete/save: no Django signals, storage
    deletion or Cloudinary/network calls can be triggered by model hooks.
    """
    _guard()
    if not isinstance(approved_digest, str) or len(approved_digest) != 64:
        raise ValueError("Supply the digest returned by the reviewed preview().")
    if input(f"Type {CONFIRMATION!r} to execute the reviewed local cleanup: ").strip() != CONFIRMATION:
        raise RuntimeError("Cancelled; no cleanup performed.")
    # SQLite online backup includes committed WAL data; never copy/delete the
    # original file or use flush. This backup exists even if later checks fail.
    stamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%S%fZ")
    handle, backup_name = tempfile.mkstemp(prefix=f"db.before-reviewed-cleanup-{stamp}-", suffix=".sqlite3", dir=EXPECTED_DB.parent)
    os.close(handle)
    source, backup = _open(), sqlite3.connect(backup_name)
    try:
        source.backup(backup)
    finally:
        backup.close()
        source.close()
    print("BACKUP:", backup_name)
    db = _open(readonly=False)
    try:
        db.execute("BEGIN IMMEDIATE")  # Freeze writers before rebuilding the plan.
        plan = _plan(db)
        if plan["digest"] != approved_digest:
            raise RuntimeError("Database or selections changed since preview; preview and approve again.")
        if plan["blockers"]:
            raise RuntimeError("Protected/retained records would be affected. Resolve blockers and preview again.")
        if not any(plan["selected"].values()):
            raise RuntimeError("No test rows were explicitly selected.")
        for table in plan["delete_order"]:
            ids = plan["selected"][table]
            for offset in range(0, len(ids), 500):
                batch = ids[offset:offset + 500]
                placeholders = ",".join("?" for _ in batch)
                result = db.execute(f"DELETE FROM {_quote(table)} WHERE id IN ({placeholders})", batch)
                if result.rowcount != len(batch):
                    raise RuntimeError(f"Unexpected deletion count for {table}; rolling back.")
        for table in plan["reset_tables"]:
            if _count(db, table) != 0:
                raise RuntimeError(f"Refusing to reset nonempty table {table}.")
            db.execute("DELETE FROM sqlite_sequence WHERE name = ?", (table,))
        _, tables = _schema(db)
        if _fingerprint(db, tables, omitted_sequences=plan["reset_tables"]) != plan["preserved"]:
            raise RuntimeError("Retained rows/configuration/counters changed unexpectedly; rolling back.")
        for table, ids in plan["selected"].items():
            if _references(db, table, "id", set(ids)):
                raise RuntimeError(f"Selected test rows remain in {table}; rolling back.")
        receipt = {"database": str(EXPECTED_DB), "backup": backup_name, "selected": plan["selected"],
                   "reset_tables": plan["reset_tables"], "after": _fingerprint(db, tables)}
        db.execute("COMMIT")
        print("Reviewed cleanup committed; all retained rows and protected configuration verified unchanged.")
        return receipt
    except BaseException:
        if db.in_transaction:
            db.execute("ROLLBACK")
        raise
    finally:
        db.close()


def verify(receipt):
    """Read-only verification. Run immediately, before creating new test rows."""
    db = _open()
    try:
        if receipt["database"] != str(EXPECTED_DB):
            raise RuntimeError("Receipt belongs to another database.")
        _, tables = _schema(db)
        if _fingerprint(db, tables) != receipt["after"]:
            raise RuntimeError("Database changed after cleanup; review current data against the receipt.")
        sequences = dict(db.execute("SELECT name,seq FROM sqlite_sequence"))
        for table in _models():
            rows = _count(db, table)
            maximum = db.execute(f"SELECT MAX(id) FROM {_quote(table)}").fetchone()[0] or 0
            if table in receipt["reset_tables"] and (rows or table in sequences):
                raise RuntimeError(f"Reset verification failed for {table}.")
            print(f"{table}: rows={rows}, sequence={sequences.get(table)}, next integer ID={max(maximum, sequences.get(table, 0)) + 1}")
        print("PASS: selected test rows removed; retained/admin/CMS/product/settings data matches the committed receipt.")
    finally:
        db.close()
