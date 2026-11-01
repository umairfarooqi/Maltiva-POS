# Security fixes verification — 2026-11-02

Branch: `codex/session-privacy-lockout` (uncommitted).

## Delivered

- Shared session ownership covers token, session revision and database generation. Private transport and body reads (JSON/blob/text/array buffer/form data and clones), errors, API cache writes, parent callbacks and maintenance downloads reject obsolete work. Receipt lookup keeps its existing cancellation interface.
- Costs/profits/credentials are recursively excluded from persisted checkout history/catalog, drafts, confirmations/display payloads and durable pending/rejected/acknowledged copies. Full authorized report/catalog/staff/log data stays in current-token memory. Logout/account changes discard that memory and sanitize old replaceable storage. Current cashier server permissions are unchanged.
- Durable migration re-reads the current row inside its write transaction. Old pending copies cannot overwrite a newer saved acknowledgment. Failed replacement preserves the original recovery row and fails the read. Draft identity, pricing/options/notes, original cashier, payment/tender/change, database generation and rejection/blocked state are retained. Runtime preview costs use zero placeholders; reports fetch complete server financial snapshots.
- Late valid 201 acknowledgments stay saved under the same key, including optional-cache failure and a session change while outbox removal commits. Private fields are suppressed across the session boundary. Old-database acknowledgments remain durable and quarantined rather than repopulating restored receipt cache. Unreadable acknowledgments remain pending under their original key.
- Known-account lockout is persisted in SQLite by user ID across username/email, PIN/password and manager approvals. It survives actual server restart, expires after the five-minute window, and intentionally clears after administrator credential reset. Unknown identifiers are hashed and bounded. CLI administrator reset also clears the canonical lock.
- Compatible earlier backups without the additive `auth_failures` table remain restorable. Its local counters are excluded from schema comparison/import and cleared by explicit restore, while business data/schema checks, safety backups and session revocation remain intact.
- The automatic second Electron window now loads `/customer-display`.
- A concurrent-sync recovery defect exposed by the broad run was fixed: an earlier sync now reconciles a known saved/pending/rejected result before erasing an uncertain checkout warning. A controlled regression pauses that sync until the storage error and verifies safe recovery with the same key.

Implementation rationale and acceptance criteria: [plan](../../plans/2026-11-02-session-privacy-lockout.md). Original evidence remains unchanged in the preceding audit folder.

## Automated results

- **351 passed / 47 files**, 176.49 seconds (`npm test -- --maxWorkers=1 --reporter=dot`). Includes the original 319 tests plus 32 new regressions: 24 privacy/recovery/body-boundary tests, six lockout/restore tests, one Electron route test and one controlled concurrent-sync checkout test.
- Focused checkout/privacy run: **51 passed / 2 files**. Focused privacy/lockout/session run before the final extra regression: **36 passed / 3 files**. These focused results are not added to the full-suite count.
- Real disposable-server checks cover mixed login aliases and credentials, manager approval, restart persistence, admin unlock, legacy-compatible restore, existing server authorization, receipt/money snapshots, idempotency, recovery ownership and backup failures. The existing suite also covers actual restart/lost acknowledgment, quota failures, receipt reprints and full financial history.
- TypeScript, renderer production build, bundled server build, Electron configuration checks and `git diff --check` passed. Existing jsdom navigation and React act notices remain non-failing. The renderer is about 506 KB minified / 137 KB gzip and triggers Vite's >500 KB chunk warning; bundle splitting is not part of this security fix.
- Earlier broad runs exposed outdated cache-profit/cancellation expectations and the real concurrent-sync checkout race. The tests now assert safe persistence, preserve cancellation behavior, model server-owned quote costs, and include the deterministic race regression. The final complete result above follows those corrections. A text-encoding issue caught during browser inspection was corrected; the final browser bundle displays the original English status text correctly.

## Fresh production browser

Fresh production renderer and bundled server, new browser origin `http://127.0.0.1:57737`, isolated backend `127.0.0.1:57736`, unique OS temporary database/build directory. The old QA app at 60621 and live sales processes were not used. Fixture: 101 same-day synthetic saved orders/payments; cloned historical rows deliberately exercise report pagination and payment filters.

The browser harness is bundled from the current API/storage/outbox/maintenance services. It authenticates real disposable admin/cashier accounts for cache/recovery checks and uses controlled synthetic responses for delayed JSON/blob/201 cases. It is a service-level browser regression harness, not a claim that a natural human-speed switch happened to reproduce each race. Its results and source are archived here.

All **11 browser assertions passed**:

1. Disposable administrator authentication.
2. Authorized costs remain available in memory.
3. Persisted product cache has no confidential fields.
4. Persisted order cache has no confidential fields.
5. Switch to a real cashier session.
6. Cashier bootstrap/recovery contains no admin costs or staff list.
7. Submitted draft keeps its original attempt key without private persistence.
8. Durable saved acknowledgment survives cache clearing in safe form.
9. Delayed admin product response cannot change the new session cache.
10. Delayed admin backup blob cannot trigger download after switching users.
11. Late 201 preserves saved state/key without private cache fields.

Synthetic recovery rows were removed after the harness. It did not submit real fixture sales, download a real backup through the browser or send print jobs.

The actual production UI then passed:

- Admin PIN login and one cash sale: `#F20261102-0102`, token 102, Rs.990 sale, Rs.1,000 tender, Rs.10 change. Receipt preview opened; no Print button invoked.
- Last receipt reopened that same sale. A new one-item Quick Snack Value Pack draft survived report navigation, reload, an older `#F20261102-0001` receipt lookup and admin → cashier switching. Readiness was awaited before checking the reloaded draft.
- Daily Sales showed **102 orders / Rs.100,980** with **50 rendered rows**. Admin P&L showed complete **Rs.56,100 cost / Rs.44,880 profit**. These values match direct read-only queries against the disposable database.
- Cashier navigation contained Order Line and Receipts, and the active cart remained visible. Fresh API permission/cost stripping controls remain covered by server tests.
- No browser warning/error entries in the observed production UI or harness. Captured request metadata: **84 API requests, no status >=400**; exactly one real sale POST (**201 / 11 ms**) followed by a **9,078-byte catalog refresh / 6 ms**. These are localhost proxy timings, not end-to-end interaction benchmarks.
- Server log contains initialization/startup only. Final disposable database: integrity `ok`, 102 orders, 102 payments, zero duplicate idempotency keys; latest order completed, 99,000-paisa total and 1,000-paisa change.

## Evidence and limitations

`test-summary.txt`, `browser-security-checks.txt`, `browser-security-checks.ts.txt`, `database-check.json`, request metadata, console result and screenshots retain the evidence. No credentials, token values or response bodies are recorded in request evidence. Fixture source uses synthetic test credentials only.

No live database write/migration/restore, live server restart, physical print, commit or push was performed. Repository database metadata remained 159,744 bytes / UTC modification 2026-10-29 20:36:37 (metadata, not a content hash). Only the disposable QA processes were stopped after verification.

This protects application delivery/state/persistence boundaries during operator changes. It does not create isolation from someone controlling the same Windows account, browser profile, process memory or database files. Full database backups and queued offline revocations remain privileged material. A failed durable migration intentionally preserves its original row for recovery; repair is required before that row can be read through the application. No active database was opened by a newly built server except the disposable test databases.

The second-monitor route is covered by simulated Electron launch behavior and the dedicated browser page; installed Electron/two-monitor hardware and physical paper remain manual checks. Broader audit findings (cross-request stock freshness, report/export edge cases, zero-price menu behavior, manager-policy mismatch, dependency advisories and bounded startup/server totals) remain separate work. No role permissions were broadened.
