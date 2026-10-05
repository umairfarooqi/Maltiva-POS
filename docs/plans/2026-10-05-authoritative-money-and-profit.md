# Phase 2A: authoritative prices, integer paisa and profit

Date: 2026-10-05. Status: implemented; final verification recorded below.

The user selected prices and totals, money storage, and profit as the next work, and requested updated docs and a plan. Reference: `docs/MALTIVA_POS_SPEC (1).md`, sections 5, 16.5–16.8. Baseline: recovery commit `fd9c208`; 64 tests across 10 files, TypeScript, renderer/server builds and Electron configuration checks passed. That baseline is evidence for recovery, not for the money changes below.

## Outcome and scope

For a new accepted sale, SQLite and the API contain server-calculated integer paisa values. Cart estimates, the customer display and receipts use the same rounding rules. Profit excludes tax and uses historical cost snapshots. Existing sales, payments and pending recovery keys survive the transition.

| Before 2A | Implemented in 2A |
| --- | --- |
| `server.ts` stores request-supplied financial values. | Resolve catalog prices, costs, names and variation selections on the server; ignore client-derived financial fields. |
| `App.tsx` calculates tax to two decimal places; `CartDrawer.tsx` rounds to whole rupees. | Replace independent calculations with `src/shared/money.ts`. |
| `src/services/db.ts` declares REAL money columns. | Versioned migrations convert active money columns to INTEGER paisa, including product/variation/bundle JSON and payment tender/change. |
| Product/cart/order types and localStorage/IndexedDB entries do not identify units. | Explicit paisa field names and a schema version prevent interpreting Rs.333 as 333 paisa or multiplying an already converted value twice. |
| Profit is `total - totalCost`, and `ProfitLossView.tsx` falls back to live product costs for zero-cost snapshots. | Store net revenue and cost snapshots; aggregate only accepted saved sales and preserve valid zero cost. |

Included: current menu price/cost inputs, variation price/cost adjustments, tax settings needed for calculations, basic single-payment consistency, existing financial display/CSV paths, and recovery compatibility.

Deferred: signed sessions, hashed credentials, role guards, server-derived cashier identity, server order/token counters, split payments, wallet/gateway processing, discount approvals, shifts/Z-reports, kitchen/refund flow, full report APIs, printing workers and backup/restore features. No production-readiness claim or deployment is part of this plan.

## Calculation and contract decisions

1. Use explicit fields such as `pricePaisa`, `unitCostPaisa`, `subtotalPaisa`, `taxPaisa`, `totalPaisa`, `netRevenuePaisa`, `profitPaisa`, `tenderedPaisa` and `changeDuePaisa`; database names use `_paisa`. Rates/margins use integer basis points (`10% = 1000 bp`). New request/recovery payloads carry a money schema version.
2. Parse rupee text once at the menu/settings/cash-input boundary. Format paisa only at the display boundary, preserving two decimal places when needed. Reject nonfinite, malformed, overflowing or excess-precision new money inputs; do not use `toFixed` as arithmetic.
3. Shared `computeTotals` validates positive integer quantities and safe integer money. Use integer intermediates (BigInt where multiplication can exceed the safe-number range), deterministic half-up rounding for nonnegative tax and discount, and largest-remainder line allocation with stable input-order ties. Negative variation adjustments are valid only when the resulting price/cost remains nonnegative. Negative profit remains valid.
4. Apply a discount before tax; allocate it across lines. Exclusive mode: net revenue is subtotal minus discount, total adds tax. Inclusive mode: total is subtotal minus discount, net revenue subtracts included tax. Allocate tax for inclusive line revenue so line sums match order revenue. Store tax rate/mode, line discount, line net revenue, line cost and order totals as sale snapshots.
5. Use the existing tax setting as the migration source; tax-exclusive is the compatibility default. Support a persisted explicit inclusive/exclusive setting for shared calculation parity. Do not guess historical tax mode from the current setting.
6. The calculator supports discount arithmetic, but the current checkout remains zero-discount. Reject attempts to submit nonzero discounts until role-based discount approval exists; client discount values must not create unauthorized price reductions.
7. Resolve product IDs and selected group/option IDs from the database. Validate required groups, single/multiple selection rules, duplicate options, unknown options, availability and quantities. Never add selected deltas twice when a cart unit price already includes them. Preserve the existing deal's catalog price/cost basis; derive bundle snapshots from server data, without introducing recipe-based stock accounting.
8. Keep one payment line for the current flow: server sets its applied amount to the calculated total. Cash must supply valid tender at least equal to that total; change is tender minus applied amount. Noncash methods apply exactly the total and cannot carry cash change. These checks do not represent external payment authorization.

## First-commit pricing and pending sales

- Add a server quote endpoint, `POST /api/orders/quote`, accepting selected product/option IDs and quantities. It returns canonical selections, totals and a pricing fingerprint identifying the reviewed basket, applicable prices and tax rules. The fingerprint is a pricing-consistency check, not authentication.
- Obtain a quote before transport when the local server is available; show the cashier the server's amount and retain the fingerprint with the durable attempt. Product, quantity and payment changes must invalidate/review the quote as appropriate.
- Inside `POST /api/orders`, check the idempotency key first. If it already committed, return its original 201 snapshot without repricing or checking a newly required quote.
- For an uncommitted request, reload catalog/settings and compute again inside the transaction. Ignore submitted unit prices, deltas, costs, totals, profits and margins. If the reviewed quote no longer matches the basket/prices/tax, return an explicit pricing-review conflict with current totals and write no sale, payment or stock deduction.
- Server-unreachable checkout can still stage a durable pending intent with its original key. A pending attempt with a matching reviewed quote replays automatically. An unquoted/stale attempt requires explicit review after reconnect; do not silently charge the new price.
- Preserve legacy pending and rejected records. A server-committed legacy key must reconcile successfully even if the product is now deleted or its prices changed. An unsent legacy attempt without a reviewed quote becomes a durable review-required rejection on replay, retains its basket/key and supports an explicit requote/retry.
- A lost/malformed response, full optional cache, logout or cache clearing must retain the same recovery guarantees established in phase 1. Quote failure must never be displayed as a saved sale.

## Migration and historical data

- Add a migration version table and deterministic conversion helper. Test on temporary copies/fixtures first. Implementation must not start the user's live database merely to run tests.
- Before the first live money migration, create a SQLite-consistent local safety copy using the database backup mechanism, including WAL contents; a bare filesystem copy of an active `.db` is insufficient. Verify the safety copy can be opened. This migration safeguard is not the phase-6 backup UI.
- Inventory every monetary field: product prices/costs; nested variation deltas and bundle metadata; order totals/cost/profit/change; item prices/cost/totals and nested snapshots; payments' amount/tender; initial seed data; printer tax settings; browser catalog/history; drafts; IndexedDB pending/rejected/saved records; legacy offline queues and customer-display payloads.
- Existing REAL rupees convert once to paisa from the number's decimal representation, rounded to nearest paisa with half-paisa ties away from zero (Rs.1.005 becomes 101 paisa). Preserve original source values in a legacy audit record so sub-paisa rounding is auditable, and fail with actionable diagnostics for invalid financial rows instead of silently coercing them to zero.
- Rebuild active tables as needed so canonical monetary columns actually have INTEGER storage/check constraints; changing TypeScript types alone is insufficient. Preserve keys, foreign keys, indexes, row counts and relationships in one transaction. Any error rolls back schema and converted data; a restart/rerun cannot scale money twice.
- Preserve historical charged totals, tax, tender and payment relationships. Derive historical net revenue from saved charged total minus saved tax, and profit from that net revenue minus saved cost; retain previous profit values in the audit record and identify corrected legacy records. Do not reprice old items from the current catalog.
- Missing historical cost is unknown, not today's cost. Preserve the distinction from a valid zero cost and surface incomplete historical profit data instead of manufacturing a number. Where legacy line tax/discount allocations must be reconstructed, use original snapshots and deterministic allocation, mark them as derived and reconcile their sums.
- Convert browser storage through explicit versioned adapters. Keep old recovery copies until their replacement transaction commits. Preserve every order ID, idempotency key and rejection reason. Quota/migration failures must not drop records or send an unrecoverable request.

## Implementation checklist

- [x] Add calculator/decimal parser/formatter and focused tests for rounding, line allocation, overflow, zero revenue and negative profit.
- [x] Add migration fixtures and transaction/version tests; implement SQLite conversion and snapshot/audit preservation.
- [x] Update seed data, catalog/settings persistence and product normalization for canonical paisa values and validated decimal entry.
- [x] Add versioned product/order/cart/payment contracts and browser storage/outbox migration adapters.
- [x] Add authoritative server pricing and quotes; update atomic sale creation and legacy committed-key reconciliation.
- [x] Update cart, variation sheet, checkout and customer-display previews, tender/change and pricing-review decisions.
- [x] Update draft/pending/saved receipts and copied receipt text to preserve accepted paisa amounts without whole-rupee rounding.
- [x] Update existing dashboard/P&L/CSV arithmetic to use saved net-revenue/cost snapshots, exclude provisional sales, and remove live-price/cost fallback. Broader reporting features remain deferred.
- [x] Run the acceptance suite below, full existing tests, TypeScript, renderer/server builds, Electron configuration and `git diff --check`; record results in this plan.

Likely files: `server.ts`, `src/services/db.ts`, `src/shared/money.ts` (new), `src/types/pos.ts`, `src/services/api.ts`, `src/services/storage.ts`, `src/services/pendingOutbox.ts`, `src/data/initialData.ts`, `src/utils/normalizeProduct.ts`, `src/utils/formatCurrency.ts`, `src/App.tsx`, `CartDrawer`, `VariationModal`, `ManageDishesView`, `SettingsView`, `CustomerDisplayWindow`, `ThermalReceiptModal`, `DashboardView`, `ProfitLossView`, and lifecycle tests. Exact adapters/migration files can be split for readability during implementation.

## Acceptance evidence required

| Scenario | Expected result |
| --- | --- |
| Rs.333.00 subtotal, 10% exclusive tax, Rs.200.00 cost | `33300` subtotal, `3330` tax, `36630` total, `33300` net revenue, `13300` profit; cart, server, display and receipt agree. |
| Rs.366.30 inclusive price at 10%, Rs.200.00 cost | `3330` included tax, `33300` net revenue, `13300` profit. |
| Three Rs.333 items; fixed and percentage calculator discounts; zero/100% discounts; fractional-paisa tax ties | Deterministic rounding; allocated line amounts sum exactly to order totals. Checkout rejects unauthorized nonzero discounts. |
| Client sends forged prices, option deltas, tax, costs, total or profit alongside a valid reviewed quote | Saved values come only from server catalog/settings and selected IDs. |
| Unknown/duplicate options, missing required option, invalid quantity/money or overflow | Clear rejection; zero new sale/payment/stock rows. |
| Cash tender below authoritative total | Rejected without persistence or stock changes; valid tender produces exact paisa change. |
| Edit product cost/price/options after a sale, including a valid zero-cost item | Existing order, item/overall profit and exported financial values remain unchanged. |
| Pending/rejected/draft order visible in UI | Excluded from confirmed sales/profit sums, retained for recovery/review. |
| Menu price/tax changes between quote and first commit, including offline replay | No silent changed charge; retain basket/key and require explicit review. |
| Same committed key after price change, product deletion or migration | Original 201 snapshot, one sale and one stock deduction. |
| REAL legacy database, incomplete legacy snapshot, failed conversion, second startup | Preserved history/IDs; explicit incomplete-data handling; atomic rollback on failure; no double conversion. |
| Old localStorage/IndexedDB entries and full browser cache | No factor-of-100 display error, dropped pending records, lost acknowledgment or repeated completed sale. |
| Failure at any sale ledger, timeout, malformed 201, server restart, bootstrap race, logout/wipe | Existing phase-1 recovery behavior remains covered and passing. |

## Completion record

Implemented in `src/shared/money.ts`, `src/shared/moneyUpgrade.ts`, `src/services/moneyMigration.ts`, `src/services/pricing.ts`, the server, storage/recovery adapters and existing financial UI. Menu price/cost and tax-setting saves require server acknowledgment; an unavailable server leaves the form available for retry rather than presenting a local-only price as persisted.

Focused acceptance coverage is in `tests/money.test.ts`, `tests/money-migration.test.ts`, `tests/authoritative-money.test.ts`, `tests/money-recovery-migration.test.ts` and `tests/money-ui.test.tsx`. Checkout tests also cover changed-quote review and a pending replay becoming rejected, closing its provisional receipt and retaining its key for review/retry. Existing atomic-sale, malformed acknowledgment, cache quota and real-server restart tests remain part of the full suite.

Verification after implementation:

| Check | Result |
| --- | --- |
| `npm test -- --pool=threads --maxWorkers=2 --reporter=dot` | 88 tests across 15 files passed. Tests use isolated databases, including actual server restarts and a WAL-aware migration backup. |
| `npm run lint` | TypeScript passed. |
| `npm run build:electron` | Renderer and bundled server builds passed. |
| `npm run test:electron` | Electron configuration checks passed. |
| `git diff --check` | Passed; no tracked live database/WAL/SHM changes. |

The test run uses explicit threaded workers because the host's default fork-worker startup timed out during an earlier run. Existing empty-image and jsdom navigation warnings are non-failing. A new multi-step recovery test has a 15-second budget; its behavior and key preservation passed in the final full suite.

The live repository database was not opened or migrated during implementation. On next server/app startup, migration runs before seeding or accepting requests, creates `<database-path>.before-money-v2.db` using SQLite's backup API, verifies its integrity, archives original financial rows in `legacy_money_audit`, and stamps migration version 2 after successful conversion. Invalid legacy rows stop startup with diagnostics. Missing or inconsistent historical costs yield an incomplete-profit warning and are excluded from P&L. A current catalog item with missing cost requires a valid catalog cost before sale; zero cost remains valid. Historical tax mode is left unknown rather than inferred from current settings.

Unquoted or stale offline sales retain their basket/key and require explicit pricing review after reconnect. Already committed keys return the original saved amounts before any new pricing checks. This behavior is intentional.

Remaining phase 2 priorities: (1) hashed credentials, signed sessions, role guards and server-derived cashier identity; (2) server-issued order/token numbering; (3) full payment rules and discount permissions. Shifts, refunds, printing workers, report APIs and backup/restore UI remain later phases. No deployment, live cashier smoke test or production-readiness claim is included.
