# Stock, reports and settings verification — 2026-11-02

## Changes

- Shared catalog sequence covers catalog reads, full bootstrap and catalog mutations. A late bootstrap skips its catalog writes and returns the current catalog, while preserving complete report history. Session ownership still guards cache/state and recovery fallback.
- The existing five-second heartbeat now fetches the lightweight catalog even when this terminal has not sold anything. Sync calls coalesce; checkout ownership still blocks unsafe catalog commits. Unchanged settings keep their object identity so stock polls do not reset settings edits.
- P&L category filters now apply to counts and payment revenue as well as item revenue/cost/profit. Payment revenue is explicitly tax-exclusive and comes from saved line snapshots. Cancelled and incomplete sales remain excluded; the profit API now also excludes cancelled sales.
- CSV uses a UTF-8 Blob, complete escaping and formula protection for names/categories. Signed financial numbers retain their values.
- Managers see read-only store/tax/printer controls, with an explanation. Admin save still works; local theme remains usable. The server's admin-only permission and privileged backup/staff controls are unchanged. This follows the explicit capability table in MALTIVA_POS_SPEC.md, rather than the contradictory staff-page wording, which is corrected.
- Zero-price dishes remain in server/client catalogs and persistent cache. A free sale still deducts stock and records its real cost and negative profit.

## Measured browser and database results

Fresh production renderer/server built into an OS temporary directory. Only disposable databases were used. The 10,001-row starting history uses one real reviewed template sale plus deliberately cloned historical rows; clones do not certify a real stock ledger.

- Added a reviewed category sale: net revenue 12,550 paisa, tax 2,134, customer payment 14,684, cost 6,525, profit 6,025. Selecting Audit Snacks showed one order, cash revenue Rs. 125.50, card/scan zero, cost Rs. 65.25 and profit Rs. 60.25.
- A real browser CSV download retained the entire `Deal #1, "Special"` row and correct paisa values. `category-profit.csv` is the downloaded artifact.
- A zero-price dish was visible, sold for exactly zero cash and produced receipt #F20261102-10003/token 10003. It deducted one unit; the DB kept price zero, stock nine, cost 500 and profit -500 paisa. A new one-item free-dish cart and the catalog survived reload.
- Daily Sales with 10,003 orders rendered 50 rows and 1,060 total DOM elements. It showed all 10,003 orders and total Rs. 9,901,136.84. Financial source data was not truncated.
- Admin settings draft remained through multiple stock polls and saved successfully. Switching to manager showed disabled store, tax, printer and save controls, a read-only explanation, enabled local theme and no database restore controls.
- Remote-terminal waste changed cashier add controls to disabled without reloading or navigating. Remote restock re-enabled them in that same cashier view. Observations give upper bounds of 9.8 seconds for waste and 19.3 seconds for restock, including tool/observation gaps; these are not measured polling latency. The configured interval is five seconds, with request time and checkout deferral additional.
- A separate browser harness passed four controlled checks: older full success/fallback after new catalog, reversed catalog response order, and an account switch during bootstrap. This intentionally controls transport timing; it is distinct from the real-server remote-stock checks.
- Admin/manager and final cashier browser console captures had zero warnings/errors. Request capture contains response metadata only. See request-summary.json and requests.jsonl; no request tokens or bodies are recorded. Server output contains initialization/startup only.
- The full profit API returned all 10,003 rows with totals matching SQLite. This took 12,518 ms on this QA machine; it still loads full history and performs per-order reads, so server aggregate/batched report work remains a performance limitation. See profit-api-check.json.
- Disposable SQLite integrity: ok; 10,003 orders, 10,003 payments, zero duplicate idempotency keys. Total 990,113,684 paisa; net revenue 990,111,550; cost 550,062,025; profit 440,049,525. See database-check.json.

## Automated verification

The final current-code full run passed **363 tests across 49 files** in 188.44 seconds (12 additional tests over the previous 351-test baseline). TypeScript, Electron configuration, production renderer/server builds and git whitespace checks passed. The full log is in test-summary.txt. Regressions cover full bootstrap/cache ownership on success and fallback, catalog reversal, mutation invalidation, external stock refresh without full history, settings draft preservation, category/payment counts, complete CSV and signed values, manager read-only controls, zero-price reload and server checkout, and cancelled-sale API totals. Earlier audit diagnostic probes remain unchanged and are not represented as correctness tests.

## Limits and safety

Stock refresh is periodic, so another terminal's change is not instant; checkout still performs server-authoritative pricing and transactional stock checks. Browser background throttling/offline periods can delay polls. Complete history still downloads at startup and on report entry; server-side date-range aggregates and smaller startup payloads remain planned. Vite retains the existing >500 kB chunk warning (about 508 kB minified); no bundle-size claim is made.

No live DB migration, write, restore or server restart was performed. Live file metadata remained 159,744 bytes, last write 2026-10-29 20:36:37 UTC; this is metadata, not a verified hash. The disposable QA server processes were stopped after verification. No physical print job was sent. No commit or push was made. Existing security work and audit artifacts were preserved.
