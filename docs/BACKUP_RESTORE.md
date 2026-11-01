# Back up and restore the POS database

## Make a backup

1. Sign in as an administrator and open Settings → Database backup and restore.
2. Select **Create database backup**. The server saves a complete, checked SQLite snapshot under `backups` beside the database it is actually using. Electron uses its app-data directory; a development server uses `MALTIVA_POS_DB_DIR` or its working directory.
3. Select **Download** beside that backup and keep a copy on a separate drive or protected storage. A backup on the same disk alone does not protect against disk failure. You can reopen the list with **Show saved backups**.

Saved orders, items, payments, stock movements, stock quantities, menu, cashier ownership, number counters, staff credentials, settings and internal audit data are included. External image files and browser-only draft/pending orders are not. Finish syncing sales before making the copy intended for moving to another machine. The old **Export cached data** action remains a separate browser export and cannot be used for database restore.

Backup files contain private business data and staff login information. Restrict who can access them. This version supports backup and restore files up to 64 MB and the exact database schema of the running POS; it rejects incompatible files rather than guessing how to convert them. Backup creation rejects larger files before publishing them, so a completed backup stays within the restore limit.

## Restore a selected backup

1. Stop checkout on all terminals. Finish or reconcile pending/rejected/draft orders on the device performing restore. Do not erase recovery storage to bypass this check.
2. Sign in as an administrator. Select **Choose backup to restore** and pick the downloaded `.db` file.
3. Review current and backup record counts, the file digest and the administrator usernames available in the backup. You will need a password from that backup to sign in afterward.
4. Enter your **current** administrator password, type `RESTORE`, and select **Restore database**. If anything changed after the preview, select the file again for a fresh review.
5. The server first saves and verifies a `before-restore-…db` safety backup containing the data immediately before replacement. Only then does one database transaction restore the snapshot. A failure during replacement rolls back all table changes.
6. Sign in again using an account from the backup. Everyone's prior sessions are revoked. Review saved totals, menu and stock, then download the safety backup to separate storage too.

Restore replaces history; it does not merge later sales into the older backup. Later sales remain in the safety copy. Issued daily number counters keep the larger of their current and backed-up values, so printed tokens are not issued again. Internal restore metadata, signing secret and database generation are renewed.

Other devices' old recovery copies are retained and blocked from silently creating new sales. An administrator must compare them against restored history and the safety backup before any manual recovery. Already saved matching keys can still reconcile to their original orders. Do not manually change keys or database-generation fields to force replay.

## Errors and recovery

- A failed backup is not shown as a completed backup. Keep existing copies and resolve the reported storage or validation problem.
- An invalid, corrupt or incompatible restore file leaves the running database untouched.
- If a restore request loses its connection, reconnect and sign in before deciding what happened. A successful restore revokes old sessions and creates a safety backup; do not create replacement sales to test it.
- Restore previews expire after 15 minutes and belong to the session that created them. A server restart requires selecting the file again.
- Cancelling a restore discards the temporary server upload, including its SQLite WAL/SHM companion files. The original file you selected remains unchanged. If the server is unreachable, the preview remains subject to expiry.
- On a replacement computer, install the same POS version, provision a temporary administrator through the existing administrator setup process, then restore the downloaded backup. The backup's staff accounts replace the temporary account.
- If the original database cannot start, preserve its entire folder, including WAL/SHM files. Use a separate healthy installation/database for recovery. Do not copy over a database while the POS is open.

These are manual backups. Scheduled/offsite rotation, encrypted backup archives, cross-version conversion and a guided merge of quarantined recovery copies are separate features. Downloading and restoring through an installed Electron build still needs an acceptance check on the actual Windows terminal.
