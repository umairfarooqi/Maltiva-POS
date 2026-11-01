# Security follow-up — 2026-11-02

## Assessment

High priority on a shared terminal. The strongest new finding is that an administrator-started database download can still trigger after switching to a cashier while its body is being decoded. The initial request remains server-authorized; the client does not cancel/suppress delivery to the later session. This is more consequential than a visible menu refresh because a full backup is sensitive account/business data.

The cache problem also extends beyond localStorage and offline bootstrap. Durable pending, rejected and acknowledged snapshots can retain administrator financial costs and return them to cashier recovery reads. Clearing replaceable caches alone does not fix this. The lockout weakness is separate: alias-specific counters and in-memory-only persistence weaken PIN/password guessing protection.

There is no evidence here of a live incident, plaintext credential disclosure through normal cashier API responses, or cashier elevation to administrator. Local role separation is weaker than server authorization. A user with unrestricted access to the same Windows account/browser storage/files has a broader trust boundary than the POS login screen; cache partitioning or frontend guards are not an OS security boundary.

## New controlled checks

Fresh focused run: **12 checks passed / 2 files**, 5–6 seconds on the observed machine (exact final duration in `security-followup-results.txt`). Eight diagnostics reproduce unsafe behavior; four controls verify working boundaries. These are evidence probes, not twelve regression tests asserting the implementation is secure.

| Check | Observed result |
| --- | --- |
| Clear every replaceable cache, retain a durable administrator acknowledgment, then load recovery as cashier | Saved order survives correctly, but 55,000-paisa cost and line cost remain in the returned order. |
| Clear replaceable caches, retain a rejected administrator order, then load cashier recovery | Rejected state and original identity remain; administrator cost is still returned. |
| Online cashier bootstrap with clean server orders but an unsaved administrator pending order in IndexedDB | Bootstrap reports online and users are empty, yet merged recovery includes administrator cost. This is not limited to network failure. |
| Delay stock-adjustment JSON after the old admin request has passed the transport guard; switch to cashier; release JSON | Old product cost and inventory log are written into cashier cache. |
| Delay admin sale HTTP 201 JSON; switch to cashier; release canonical sale | Sale remains saved and pending copy is removed under its original key, but private admin cost enters the newer cache. The acknowledgment must not be discarded when fixing privacy. |
| Fresh safe server row for the same saved key as an older costly cache row | The safe server row replaces matching old saved costs. This explains why ordinary online testing can miss the problem. |
| Delay administrator backup response blob; switch to cashier; release a synthetic blob | The download anchor click still runs in the cashier session. No actual backup or live credentials were downloaded in this client probe. |
| Five wrong username attempts, then valid username vs same account email | Username returns 429; email returns 200 with the correct secret. This bypasses the lockout, not the requirement to know a valid PIN/password. |
| Restart only the disposable test server while username remains locked | Valid username immediately returns 200 after restart; lockout counters were memory-only. |
| Cashier permissions and fresh bootstrap | Five protected admin/menu/stock/settings/profit requests return 403; fresh cashier products exclude cost fields and bootstrap users are empty. |
| Server logout followed by reuse of the same token | Logout returns 200, old token reuse returns 401. |
| Authorized backup of disposable fixture, compared byte-for-byte to its generated file and opened read-only | Full backup contains staff credential hashes, signing-secret material and active-session records. Values were not printed or archived. This is expected for the current full DB backup and confirms why downloads must remain private. |

The last check used a real disposable server backup, not a production backup. An initial attempt to inspect the WAL-format downloaded image directly in an in-memory SQLite connection failed with SQLITE_CANTOPEN; the corrected check compares the downloaded bytes with the generated disposable backup and opens that file read-only. Final checks all pass.

## Why the current guards are incomplete

- [session.ts:17](D:/Shakeel/Github/maltiva-pos/src/services/session.ts:17) checks the token after the fetch resolves. More asynchronous work follows in callers: JSON decoding, blob decoding and IndexedDB operations.
- Bootstrap and catalog now recheck before their commits, but [api.ts:123](D:/Shakeel/Github/maltiva-pos/src/services/api.ts:123), stock adjustments and other private mutation/read callers do not consistently do so. App mutation handlers also commit returned results without a common initiating-session guard.
- [maintenanceApi.ts:37](D:/Shakeel/Github/maltiva-pos/src/services/maintenanceApi.ts:37) awaits the backup blob and then creates/clicks the download link without checking the initiating session again.
- [api.ts:19](D:/Shakeel/Github/maltiva-pos/src/services/api.ts:19) merges all recovery states without role-safe financial projection. [pendingOutbox.ts](D:/Shakeel/Github/maltiva-pos/src/services/pendingOutbox.ts) intentionally retains recovery across sessions, which must continue, but currently retains/returns private fields too.
- [storage.ts:216](D:/Shakeel/Github/maltiva-pos/src/services/storage.ts:216) clears only active user/token. Private financial history, product costs and staff records remain in shared replaceable storage. Draft products/options can also carry costs by code inspection; they need inclusion in migration/testing, not blanket deletion.
- [server.ts:538](D:/Shakeel/Github/maltiva-pos/server.ts:538) locks submitted identifier text while account lookup accepts username/email. Its failures map is not persisted across restart.

[receiptsApi.ts:22](D:/Shakeel/Github/maltiva-pos/src/services/receiptsApi.ts:22) already illustrates the desired post-decode ownership/cancellation check for receipt reads. Reuse a common policy rather than assuming every caller has remembered all async boundaries.

## Recommended implementation order

1. **Stop late private delivery across sessions.** Introduce a shared session identity/generation guard covering private response JSON/blob consumption and every cache, UI, export/download and error callback. Abort obsolete requests on logout/account switch as an additional measure; cancellation alone is insufficient. Capture identity when an operation starts, then validate at the final delivery/commit boundary. Cover menu, stock, categories, staff, settings, maintenance and recovery consumers.
2. **Minimize persisted private data.** Keep admin reports/staff details session-bound and avoid persisting full confidential financial snapshots in general checkout caches. Persist only the fields needed for receipt/draft/recovery correctness where feasible. Apply shared role-safe projections on reads and writes, recursively covering order/product/variation/bundle costs and profit arrays. A cache namespace keyed only by username does not protect stored bytes from someone controlling the same browser profile.
3. **Migrate safely.** Clean existing replaceable private caches and sanitize retained recovery/draft copies without changing any sale identity, quantities, options, notes, payment/tender/change, original cashier, database generation or server acknowledgment. Write and confirm each durable replacement before removing the old copy. Keep legacy queue migration, quota failure and unavailable-IndexedDB behavior safe. Do not empty browser storage or delete the outbox as a shortcut.
4. **Preserve sale acknowledgments across logout.** A server 201 may already represent a paid sale. Record a minimal safe durable acknowledgment under the original key, while suppressing obsolete private UI/cache delivery. Keep uncertain results pending under that same key. Never turn logout into permission to edit/reissue the submitted sale.
5. **Fix canonical account lockout.** Key known-account failures by server user ID across username/email and PIN/password paths; persist lock expiry/counts so restart does not reset protection. Define bounded treatment for unknown identifiers, consistent manager-approval behavior and deliberate admin unlock/reset. Keep a generic failed-login response and no self-reset path.
6. **Acceptance before release.** Convert the diagnostics to tests asserting the correct result. Test account switches during fetch/JSON/blob/IndexedDB, optional-cache failure, offline fallback, old durable snapshots, late 201, replay, print/Last receipt, complete report totals and restore-generation changes. Assert fresh cashier 403/cost stripping still works and no export occurs after its initiating session becomes invalid.

I would fix private deliveries and persistence first, then canonical lockout, in a separately reviewed implementation branch. The automatic Electron customer-window route from the main audit also needs correction before using a customer-facing second monitor. No account policy expansion or wholesale auth rewrite is necessary to begin these fixes.

## Practical boundary and safety

Until fixed, do not rely on the current shared browser profile to keep administrator information inaccessible to the next operator. Administrator work on a separate Windows account gives a stronger local boundary; a separate browser profile is only a reduction in accidental sharing. Finishing/cancelling admin exports before changing operators reduces the delayed-delivery risk but does not fix retained private data. Do not wipe shared browser storage while drafts or recovery copies may exist.

All new server requests, restart and backup inspection used temporary test databases created by the existing isolated-server helper. The client races used mocks/fake IndexedDB with synthetic data. No live DB write, migration, restore, restart, print, credential rotation, application-source modification, commit or push was performed. The two focused probe files are archived as `.txt` alongside this report; their imports assume their original `tests/security-followup-*.test.ts` locations when rerun.
