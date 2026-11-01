# Session privacy and account lockout

Date: 2026-11-02
Branch: `codex/session-privacy-lockout`
Status: Implemented; verification recorded in the linked audit. Not committed or deployed.

## Scope

Close the confirmed security paths in the [follow-up audit](../audits/deep-pos-2026-11-02/security-followup.md): late private JSON/download delivery, shared private caches and durable recovery data, alias/restart lockout bypass. Preserve checkout keys, saved/pending/rejected recovery, drafts, Last receipt, older receipt lookup, full report totals and existing role policy. Also correct Electron's customer-window route.

## Implementation

- `captureSession` binds work to token, local session revision and database generation. `sessionFetch` checks transport ownership and guards JSON/blob/text/array-buffer/form-data decoding, including cloned Responses and decoding/transport errors. API, parent state callbacks and maintenance downloads validate again at their final commit/delivery boundaries. Receipt lookup retains its AbortError cancellation contract.
- A late canonical HTTP 201 uses a checkout-safe projection and preserves its original key and saved state. A late result from an older database generation remains a durable quarantined acknowledgment. Unknown/malformed acknowledgment bodies remain pending under the original key. Logout does not cancel or recreate a committed sale.
- Persisted checkout data recursively excludes credentials, costs and profits, including variation/bundle costs and cost arrays. Authorized admin/manager catalog, staff, logs and financial snapshots stay only in token-bound memory; cashier response permissions remain enforced by the server. Report entry still fetches complete canonical data before showing totals.
- Startup/account changes sanitize existing replaceable storage. IndexedDB migration re-reads each current row inside its write transaction, retaining every identity, receipt, payment, note, original cashier and recovery state. A failed migration leaves the original copy and fails the read. An older legacy pending copy cannot overwrite a newer acknowledgment. No blanket storage clearing is used.
- Drafts retain required prices/options/identity; runtime cost zeros support the existing preview calculator and are stripped from persistence. Menu editing waits for an authorized current catalog so cost-free cache placeholders cannot accidentally become saved catalog costs.
- SQLite `auth_failures` shares a canonical account key across login aliases, PIN/password and manager approvals, with a five-minute failure/lock window. Known-account locks survive restart. Unknown identifiers are hashed and limited to 1,000 retained entries. Admin credential reset/activation and CLI admin reset clear the canonical lock intentionally.
- Backup restore ignores only the additive local lockout table in schema comparison/copying, allowing compatible older backups without that table. Explicit restore clears local lockout counters and revokes sessions/rotates generation/secret as before; ordinary restart preserves counters.
- Electron's second window loads `/customer-display`.
- Verification exposed a concurrent-sync checkout race: a sync begun before an uncertain checkout could erase the warning without reconciling its known result. A controlled regression now holds that sync until the storage exception and verifies that the same saved key clears the lock/cart safely.

## Verification requirements

- Private delivery suppressed across every tested async boundary, including body-decoding errors and backup blobs.
- Safe raw localStorage/IndexedDB, including legacy migration and cache-quota failure; no lost keys or acknowledgment downgrade.
- Late 201 and database-restore quarantine remain safe; the uncertain checkout race is deterministic in a regression test.
- Username/email/PIN/password/approval share lockout, real server restart retains it, admin reset unlocks it, expiry and unknown-key bounds hold.
- Older compatible backup preview/restore works; existing money, recovery, receipt, permission and backup-failure suites remain passing.
- Fresh production browser against a disposable database: account switching, privacy harness, sale/tender/change, drafts/reload/older lookup, complete admin financial totals and console/request logs.

See [verification evidence](../audits/security-fixes-2026-11-02/report.md) for measured results and limitations. No live migration, write, restore, server restart or physical print is authorized/performed by this implementation. This work is application-level operator privacy, not a boundary against someone controlling the same Windows account, browser profile or database files. Other findings in the broader audit remain separate work.
