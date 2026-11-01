# Deep POS audit — 2026-11-02

**Result: core checkout works in the tested flows, but several security, stock, reporting and reliability gaps remain. This is an audit, not a fix or a release sign-off.**

Audited commit `54769fa` on `codex/pos-loading-race-fixes`. Application source was not changed. Existing suite: **319 passed / 44 files**. Extra diagnostic probes: **9 passed**, meaning the faulty behavior was reproduced; these are not regression tests asserting safe behavior.

## Highest priority: security and sessions

### P1 — Late menu-save responses cross account changes

Location: [api.ts:123](D:/Shakeel/Github/maltiva-pos/src/services/api.ts:123), [api.ts:334](D:/Shakeel/Github/maltiva-pos/src/services/api.ts:334), [App.tsx:772](D:/Shakeel/Github/maltiva-pos/src/App.tsx:772).

The bootstrap/catalog guards do not protect menu mutations. A controlled probe paused an administrator product-save JSON body, changed to a cashier token with a cost-stripped product cache, then resumed the old response. The cashier token remained, but the old administrator cost of 55,000 paisa was written into the cashier's product cache. App's menu handlers also lack an initiating-session check before setting state. The original request was authorized; this is a response/cache isolation defect, not an unauthorized server write.

Recommendation: apply a shared initiating-session/request guard to all asynchronous mutations and their cache/state/error callbacks, including body decoding. Retain the outcome of an authorized server mutation without exposing it through a different user's cache.

### P1 — Existing administrator cache survives logout and offline cashier loading

Location: [storage.ts:216](D:/Shakeel/Github/maltiva-pos/src/services/storage.ts:216), [api.ts:263](D:/Shakeel/Github/maltiva-pos/src/services/api.ts:263).

Logout removes the token and active-user record only. The diagnostic switched an administrator cache to a cashier session, then made bootstrap fail offline. The returned cashier bootstrap contained two old staff profiles, administrator product costs and an old order cost of 55,000 paisa. This is separate from the fixed delayed-bootstrap race: no old request was needed. Session verification still protects initial offline sign-in; the service fallback itself does not isolate the cached data, and a verified session can experience an outage afterward.

Recommendation: clear or partition replaceable private caches on account changes and use role-safe projections for recovery reads. Do not delete drafts, pending/rejected copies or durable acknowledgments to solve this.

### P1 — Account lockout is bypassable through the email alias

Location: [server.ts:538](D:/Shakeel/Github/maltiva-pos/server.ts:538).

Five wrong attempts using `cashier` caused a valid username login to return 429. Logging in to the same disposable account through its email returned 200 immediately. Failures are keyed by the submitted text, while lookup accepts both username and email. Lockout also exists only in server memory.

Recommendation: resolve aliases to a canonical account identity for counting/locking, with an additional bounded policy for unknown identifiers. Test both PIN/password and all accepted aliases. Persistence/restart behavior needs an explicit policy.

### P1 — Automatic second-monitor window opens the cashier app

Location: [main.cjs:80](D:/Shakeel/Github/maltiva-pos/electron/main.cjs:80).

Electron's customer window loads the same root URL as the cashier window instead of `/customer-display`. A sandboxed execution of the actual main-process file with two simulated displays captured two identical cashier URLs. The fresh browser confirms the root URL is the full POS and the dedicated customer route works separately. The automatic second window can therefore expose terminal controls to the customer side. This was verified by code and a mocked Electron launch, not by real two-monitor hardware.

Recommendation: load the dedicated customer route and verify installed Electron on two physical displays, including logout and role changes.

## Stock and loading

### P2 — Older full bootstrap can still overwrite a newer catalog snapshot

Location: [api.ts:151](D:/Shakeel/Github/maltiva-pos/src/services/api.ts:151), [api.ts:245](D:/Shakeel/Github/maltiva-pos/src/services/api.ts:245).

The fixed sequence orders catalog requests against other catalog requests only. A diagnostic paused a full bootstrap at recovery, completed a newer catalog request with stock 7, then resumed the bootstrap carrying stock 8. Both the returned bootstrap and stored cache ended at 8. The token was unchanged. Checkout's server validation still prevents overselling.

Recommendation: coordinate catalog fields across every producer, including full bootstrap/report requests and successful mutations; validate ownership before both cache and UI commits.

### P2 — Another terminal's stock changes do not refresh through heartbeat

Location: [App.tsx:344](D:/Shakeel/Github/maltiva-pos/src/App.tsx:344), [App.tsx:375](D:/Shakeel/Github/maltiva-pos/src/App.tsx:375).

The five-second sync refreshes catalog only when this window has marked `catalogRefreshPending`. In the real production browser, an external disposable stock adjustment changed Audit Snack from 5 to 1; the page still showed 5 after 25 seconds. Later the item was sold out locally, then externally restocked to 4 at 20:28:34 UTC. At 20:29:07 UTC, it still showed Sold out and its Add button was disabled. Recovery status requests continued. `stale-stock.png` records that state. A reload or this window's own qualifying sale refreshes it.

Recommendation: add an intentional bounded catalog-refresh/invalidation policy for other-terminal changes without downloading full history or changing recovery identities.

### Known limitation — Startup and reports still download full history

The current large-history automated fixture still returns **17,554,030 bytes for 10,001 orders**, versus **9,078 bytes for catalog**. Report rows are bounded to 50, but startup/cache work and report aggregation still grow with history. Server-side totals and a smaller checkout bootstrap remain planned in the existing loading plan. Never page/truncate the data used for complete totals.

## Reports and export

### P2 — Profit endpoint includes cancelled historical orders

Location: [server.ts:518](D:/Shakeel/Github/maltiva-pos/server.ts:518).

The UI excludes cancelled orders; `/api/reports/profit` does not. A disposable saved sale was marked cancelled as a historical fixture. The API still returned orderCount 1 and profit 44,000 paisa. There is currently no live refund/void UI; this finding concerns existing/legacy cancelled records and API consumers.

Recommendation: share the canonical saved/cancelled/incomplete snapshot rules between report consumers and test financial parity. This endpoint also retains per-order reads; do not use it as the planned scalable totals endpoint unchanged.

### P2 — P&L category summaries do not use the same filter

Location: [ProfitLossView.tsx:84](D:/Shakeel/Github/maltiva-pos/src/components/ProfitLossView.tsx:84), [ProfitLossView.tsx:266](D:/Shakeel/Github/maltiva-pos/src/components/ProfitLossView.tsx:266), [ProfitLossView.tsx:284](D:/Shakeel/Github/maltiva-pos/src/components/ProfitLossView.tsx:284).

Selecting Audit Snacks correctly showed revenue Rs.125.50 and cost Rs.65.25 for its one sale, but the caption still said 104 orders and payment summaries still showed the whole store's receipts. `profit-category.png` records it. The item financial totals were correct; the accompanying scope/counts were misleading.

Recommendation: define category-scoped order counts/payment allocations, or clearly label any intentionally whole-store comparison. Keep item net revenue distinct from gross customer payments/tax.

### P2 — CSV export is truncated by `#` in a dish name

Location: [ProfitLossView.tsx:144](D:/Shakeel/Github/maltiva-pos/src/components/ProfitLossView.tsx:144), [ProfitLossView.tsx:160](D:/Shakeel/Github/maltiva-pos/src/components/ProfitLossView.tsx:160).

The actual component's Export CSV action was exercised with a saved dish called `Deal #1`. Its generated `encodeURI` data URL leaves `#` as a fragment marker. Reading that generated download URL returned the CSV header followed by only `"Deal `; the rest of the row/file was lost. Category names also are not quote-escaped like product names.

Recommendation: use a Blob/object URL, consistently escape every CSV text cell, and test hashes, commas, quotes, newlines and spreadsheet formula-like text.

## Permissions and settings

### P2 — Manager can edit Settings but cannot save them

Location: [Sidebar.tsx:181](D:/Shakeel/Github/maltiva-pos/src/components/Sidebar.tsx:181), [SettingsView.tsx:42](D:/Shakeel/Github/maltiva-pos/src/components/SettingsView.tsx:42), [server.ts:688](D:/Shakeel/Github/maltiva-pos/server.ts:688).

The Staff page explicitly says managers manage settings; their navigation exposes Settings and editable controls. Browser manager save returned 403 and the message 'Tax settings could not be saved ... Retry when it is available.' Retrying cannot resolve this permission denial. Confirmed by both browser and server probe. `manager-settings-denied.png` records it.

Recommendation: agree the manager settings policy, then align controls, server permissions and the error message. Do not simply grant broader access to hide the mismatch.

### Policy mismatch — Manager profit access differs between UI and API

Location: [Sidebar.tsx:56](D:/Shakeel/Github/maltiva-pos/src/components/Sidebar.tsx:56), [ProfitLossView.tsx:36](D:/Shakeel/Github/maltiva-pos/src/components/ProfitLossView.tsx:36), [server.ts:518](D:/Shakeel/Github/maltiva-pos/server.ts:518).

The UI says full P&L is confidential and admin-only, and hides its page from managers. A real manager token can fetch `/api/reports/profit`, including costs/profits, and manager bootstrap also includes financial costs. The older specification permits manager profit access, so this is a confirmed policy inconsistency, not a claim of bypassing an agreed rule. Decide the intended policy before changing permissions.

## Menu and reliability

### P2 — A zero-price dish saves successfully, then disappears

Location: [server.ts:307](D:/Shakeel/Github/maltiva-pos/server.ts:307), [server.ts:260](D:/Shakeel/Github/maltiva-pos/server.ts:260), [storage.ts:101](D:/Shakeel/Github/maltiva-pos/src/services/storage.ts:101).

The UI and API accept price 0. Audit Zero Price saved with 201 and appeared in Manage Dishes immediately. After reload it disappeared from both catalog and management, while SQLite still contained the row. A separate server probe confirmed the same. This prevents ordinary editing/deletion of that saved row through the UI.

Recommendation: either reject zero price clearly before saving, or support it consistently across catalog/cache/checkout. Do not silently hide a successful save.

### P2 — Malformed replaceable history can prevent sign-in from rendering

Location: [storage.ts:108](D:/Shakeel/Github/maltiva-pos/src/services/storage.ts:108), [App.tsx:72](D:/Shakeel/Github/maltiva-pos/src/App.tsx:72).

A diagnostic set the replaceable `tasty_pos_orders` cache to invalid JSON and mounted App with no token. App threw before the login screen could render because its initializer parses that cache without recovery. Other getters have similar unguarded parsing. Draft parsing already handles malformed JSON separately.

Recommendation: validate/quarantine replaceable cache and recover to a retryable screen while preserving every durable recovery copy and draft. Test malformed JSON, wrong shapes, old money versions and blocked storage independently.

## Dependency risk scan

`npm audit --json` flagged **21 package entries: 4 high, 17 moderate**. `npm audit --omit=dev --json` flagged **3 entries: body-parser high, vite high, qs moderate**. These are registry advisory classifications, not proof that a reachable exploit exists in this localhost production deployment. The all-dependency high entries include Electron and undici; build/dev exposure and the packaged Electron runtime need separate assessment. Production mode does not run Vite's development server. Exact advisory URLs/ranges/dependency paths are archived in the two dependency JSON files. No packages were updated, and npm's suggested major/downgrade fixes were not applied blindly.

## Verified working flows

| Area | Verification and practical limit |
| --- | --- |
| Login/session | Admin, manager and cashier browser logins; logout hides customer basket; suite covers expiry, revoked sessions, offline startup lock, role changes and cross-window replacement. Alias lockout gap above remains. |
| Menu/checkout | Search, category navigation, required size option, notes, quantity, new category/dish, exact paisa prices and restock worked in browser. Suite covers editing, category deletion/fallback, stock preservation, oversell and concurrent stock commands. Zero-price and refresh gaps above remain. |
| Payments | Browser card sale: 2 medium pizzas, Rs.2,500, notes preserved. Scan sale: Rs.60. Cash sale: Rs.125.50 plus Rs.20.96 tax at 16.7%, total Rs.146.46, Rs.500 tender, Rs.353.54 change. Insufficient cash was disabled. Card/scan record the operator's confirmation; no bank/payment-terminal integration is claimed. |
| Recovery | Full suite covers duplicate taps, lost acknowledgment, actual isolated server restart, pending/rejected/acknowledged copies, original cashier ownership, quota failure, draft reconciliation and database-generation quarantine. No new destructive manual recovery experiment was performed on live data. |
| Receipts | Browser Last receipt was exercised in the preceding loading audit; this audit verified older reference lookup, saved customization, cashier viewing another operator's receipt, and preservation of a new cart. Suite covers reprint/print failure without another sale. No physical print job sent. |
| Sales/P&L | Browser 104 orders: gross Rs.102,696.46; net revenue Rs.102,675.50; cost Rs.56,985.25; profit Rs.45,690.25. All matched direct read-only queries against the disposable SQLite database. Sales rendered 50 rows; card filter showed 34 rows / Rs.35,170. Report edge cases above remain. |
| Staff | Browser viewed staff roles/status, own-admin suspension guard and labeled create/reset controls; add dialog closed with Escape. Automated server/UI tests cover create, suspension, PIN/password reset, last-admin protection and session revocation. No real staff account was changed. |
| Settings | Browser theme switching, store identity, 80mm paper width and tax settings saved as admin and affected the receipt. Manager save failure reproduced. |
| Backup/restore | Browser created/listed a disposable full SQLite backup. Suite covers download, preview, cancellation, restore, rollback, changed-file/revision rejection, session binding and safety-copy failures. OS file-picker/download handling and installed-app restore were not manually certified. |
| Customer display | Dedicated `/customer-display` browser tab showed cart, tax and totals, then hid basket on logout. Automatic Electron routing defect above remains. Physical dual-monitor behavior was not tested. |
| Responsive/accessibility | Mobile navigation/cart and dialog Escape worked; input/button names inspected, desktop screenshots reviewed, no horizontal body overflow in the measured mobile checkout. Requested viewport override was scaled by the browser: actual measured mobile CSS viewport was 488×1055, not a claim of a true 390px CSS-device test. Earlier tablet request measured 1280×900 due browser scaling. Formal WCAG/assistive-device/contrast certification was not performed. |

Indicative UI-only rubric (0–4, **not** a security/readiness score): accessibility 3, performance 2, responsive 3, theming 3, visual anti-patterns 3 = **14/20**. Existing product controls/tokens are coherent; repeated report cards and dense small copy are secondary to the functional defects. Follow-up UI work should prioritize `$impeccable harden` / `$impeccable optimize`, then `$impeccable polish`; no redesign is needed to address these bugs.

## Planned or unavailable features

Refund/paid-order voids, shifts/cash reconciliation, cash-drawer movements, discounts/manager overrides at checkout, kitchen workflow and external bank-terminal settlement are not implemented as complete operational flows. Some Settings controls explicitly say unavailable. Earlier plans intentionally limit checkout to completed takeaway sales. These are product-scope gaps, not regressions introduced by the loading work. CustomersView, ManageTableView and HelpCenterView exist as inactive legacy components outside current navigation; they were not treated as working product pages.

## Evidence, safety and next steps

- `test-summary.txt`: fresh 319-test full-suite result, 154.78 seconds. `diagnostic-results.txt`: nine controlled probes confirming defects. The diagnostic sources are archived as `.txt` so passing bug-confirmation probes do not become misleading regression tests. Their imports assume the original `tests/deep-audit-*.test.*` locations if copied back for rerunning.
- `database-check.json`: disposable DB integrity `ok`, 104 orders, 104 payments, zero duplicate idempotency keys, exact canonical totals and the hidden zero-price row. Historical rows were cloned deliberately for pagination; this does not certify cloned stock movements as a real ledger.
- Production renderer/server built freshly to an OS temporary directory. TypeScript and Electron configuration checks passed. API request capture and server output are archived with metadata only, no tokens or request bodies: 206 captured API requests (198×200, 7×201, 1 expected manager-settings 403), no 5xx responses. The direct external-terminal stock adjustments bypassed this proxy and were verified from their responses and SQLite. Browser console had no warning/error entries in either observed tab; the intentional manager settings 403 is in request evidence.
- Workspace live DB metadata remained 159,744 bytes / UTC modification 2026-10-29 20:36:37. This is metadata, not a file-content hash. No live DB/server write, migration, restore, restart, physical printing, commit or push was performed.
- Recommended order: close session/cache isolation and canonical lockout; correct automatic customer-display route; coordinate all catalog writers and remote stock refresh; align permissions; fix report/export/menu/cache edge cases; assess dependencies; then implement the already planned server totals and bounded startup. Convert each diagnostic into a regression asserting correct behavior when fixing it.

No audit can prove every possible combination of every control. The table above states what was exercised and where testing was automated, simulated or still limited by hardware.
