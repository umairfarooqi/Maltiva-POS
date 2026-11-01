# Database backup and restore

Date: 2026-11-01
Status: Implemented and verified on `codex/database-backup-restore`.

## Inspection before changes

- The server opens `MALTIVA_POS_DB_DIR/maltiva_pos.db`, falling back to the working directory. Electron overrides this with its user-data directory. Backup must use the running server's connection, not guess a path in the browser or copy the repository database.
- A read-only inspection of the repository database returned `quick_check=ok`, WAL mode, 5 orders, 13 items, 5 payments and 13 stock movements. No initialization/migration or writes were run against it. This is not proof that it is the installed Electron database.
- Checkout uses one immediate SQLite transaction for orders, payments, stock, counters and cashier ownership. Saved history belongs to SQLite. Browser caches are replaceable, but IndexedDB/legacy pending sales and the checkout draft are recovery data.
- The current Settings export reads browser cache only. There is no full restore path. The menu importer has a SQLite backup, but it is a separate maintenance script with a working-directory path.
- WAL commits can live outside the main `.db` file. Copying the live file with filesystem copy is unsuitable. SQLite backup/serialization must capture a consistent snapshot.

## Plan

1. Admin-only full SQLite backup using the active connection's backup API. Validate integrity and schema, finalize under a unique name, then offer download. Keep local copies under the active database directory; downloads allow a second device/drive copy.
2. Admin uploads a database backup for a read-only preview: verify size, SQLite header, integrity, exact supported schema, relationships and an active administrator. Show backup/current counts and the accounts available after restore. Browser JSON exports are not accepted as database backups.
3. Restore requires a fresh administrator password and explicit review. Bind the preview to the authenticated session, digest and current database revision; expire it and reject changed data or files. Block same-device pending/rejected/draft recovery before UI restore.
4. Before changing data, save and verify a full safety snapshot while holding the database write lock. Restore table contents in one immediate transaction in the existing database; do not rename open live database/WAL/SHM files. Errors roll back the complete restore. Preserve matching schema and restore counters/payment/stock/history together.
5. Revoke all sessions and rotate the database generation and signing secret on restore. Discard replaceable browser caches across windows. Keep recovery copies; old pending intents must be blocked from creating sales in the restored database. Already saved keys may still reconcile safely.
6. Test using disposable databases: committed WAL contents, complete financial/stock/counter round trip, invalid/incompatible uploads, permissions/passwords, preview expiry/change, rollback/safety-copy failure, stale sessions and browser recovery after restore. Verify renderer/server builds and existing tests.

## Boundaries

No live restore, deployment or production restart is authorized by implementation alone. Backup files include sensitive staff/account/business data and must be stored privately. External image files and browser-only unsynced recovery copies are not included in a SQLite backup. Restore replaces the selected server history; it does not merge sales made after the backup. Such sales remain in the automatic pre-restore safety backup. Old recovery copies remain available for administrator reconciliation rather than automatic resubmission. Initial support is for the exact running schema; incompatible/older database files are rejected. Scheduled/offsite backup and cross-version conversion are separate work.

## Implementation details and usage

- Admin Settings now offers full database backup creation, authenticated downloads, saved-copy listing, upload validation and a password-confirmed restore preview. The separate cached-data export keeps its existing label and behavior.
- Backup creation uses `better-sqlite3.backup`; finalized copies are checked with `integrity_check`, exact schema comparison, foreign-key checks and an active administrator check. Filenames are generated on the server and download paths are allowlisted.
- Previewed uploads are limited to 64 MB, expire in 15 minutes, and are tied to the session, SHA-256 digest and database revision. Revisions detect writes by the same connection and other connections. Source schema SQL is never executed.
- Restore takes an immediate write lock, serializes and fsyncs a checked pre-restore safety copy, then copies all application tables within one transaction using FULL synchronous durability. It restores the original foreign-key/synchronous settings afterward. It does not replace an open database file. Printed-number counters retain the larger current/backed-up values to avoid reissuing tokens after rolling back history.
- Successful restore rotates the database generation and signing secret, removes restored sessions and writes an internal restore audit record referencing the source digest and safety file. Clients discard replaceable caches, retain drafts/outboxes and quarantine old recovery writes. Matching committed keys still resolve before generation checks. Old durable acknowledgments cannot reappear as new saved history.
- The 12-second isolated-test-server startup deadline replaces the earlier roughly 4.5-second polling budget, which repeatedly failed on cold Windows TypeScript startup. It stays within lifecycle hook limits. Header-bearing response mocks and report fixture dates were corrected; report tests no longer expire at a month boundary.
- Operator instructions and recovery limitations are in [BACKUP_RESTORE.md](../BACKUP_RESTORE.md). Installation-level Windows download/file-picker acceptance remains manual; no live restore was attempted.

## Verification results

- `npm test -- --maxWorkers=1 --reporter=dot`: **275 tests across 38 files passed** (252 existing tests and 23 new backup/restore tests).
- Real disposable-server tests cover authenticated backup/download, committed WAL data, complete table restoration, exact pre-restore safety data, retained issued-token high-water counters, account/password controls, session revocation, restart, changed database revisions, invalid/broken/incompatible files and quarantined old sale writes.
- Failure-injection tests cover rollback after partial table replacement, disk/fsync failure before replacement, staged-file tampering, review expiry, writes from another connection, failed backup creation and concurrent maintenance attempts.
- Client/component tests cover cache reset without deleting recovery data, old durable acknowledgments, restore blocking for local draft/pending/rejected orders, successful restore sign-out, preview/login information, explicit password/text confirmation, retryable errors, cancellation, repeated clicks and cashier controls.
- Type checking, temporary renderer/server builds, Electron configuration checks and `git diff --check` passed. Existing jsdom navigation/React act warnings are non-failing.
- The repository database remains 159,744 bytes with its original 2026-10-30 modification timestamp. It was inspected read-only before implementation; no production migration, restore, restart or deployment was performed. Test databases and build outputs used temporary paths.

## Follow-up verification before commit

- Closed two review gaps: cancelling a restore now releases the session-owned preview and its temporary SQLite companion files; backup creation rejects files larger than the supported 64 MB restore limit before publishing them. Cleanup failure does not leave the maintenance lock set.
- Added cancellation/ownership and oversized-backup regression tests, plus permission coverage for preview cancellation. All **25 focused backup/restore tests** passed after these changes. Type checking, temporary renderer/server builds, Electron configuration checks and diff checks passed again. The 275-test full-suite result above predates these final two added tests; it is not a claim that a 277-test full run was performed.
- Attempted Windows end-to-end verification with a synthetic isolated test database. Electron's runtime binary was missing, and computer use subsequently stopped because it could not reliably determine the browser URL. Download/file-picker UI acceptance is therefore **not verified**. The disposable QA server at port 60621 was left running for inspection; the live POS database was not changed.
- The cashier receipt-lookup plan is documented separately in `2026-11-01-cashier-receipt-lookup.md`; no receipt-lookup implementation is included in this commit.
