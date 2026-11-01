# Older receipt lookup for cashiers

Date: 2026-11-01
Status: Implemented and verified on `codex/cashier-receipt-lookup`.

## Goal and simple flow

**Receipts → choose a date or search an order/token → open saved receipt → reprint.**

Cashiers must be able to find an earlier customer receipt while continuing a new order. Opening or printing history must never create a sale, issue a token, change stock/payment, clear the current cart, or replace the live customer confirmation.

## Current code and access

- The empty-cart Last receipt button selects the latest saved order where the current user was the original cashier or recording staff. It does not search history.
- Admin/manager Daily Sales can open older receipt previews. Cashiers cannot open that reporting screen.
- `/api/data` currently returns all saved orders to authenticated staff, stripping cashier cost/profit fields. No paged receipt lookup or individual receipt-read endpoint exists.
- The existing receipt modal and print utility already support saved receipts and reprinting. Reuse them; keep Last receipt as the quick shortcut.
- This is the existing single-store dataset. Receipt visibility should follow current staff access to store receipts, including sales handled by another cashier. Do not imply branch isolation without adding a real order/store identifier and enforcing it on the server.

## Implementation plan

1. Add authenticated, read-only receipt endpoints for bounded search and fetching one saved order. Apply existing cashier financial-field stripping to both summaries and detail, including nested item/variation/bundle costs. Verify admin/manager/cashier access and unauthenticated denial on the server.
2. Return small receipt summaries rather than all order items. Default to today's business date and 25 results per page. Support full order reference, exact token plus selected business date, and a date range. A token alone is ambiguous across days. Preserve legacy references and legacy orders with no businessDate; do not renumber history.
3. Use parameterized queries, validated date/search/page limits and stable cursor pagination by creation timestamp and unique ID. Use matching indexes where query plans demonstrate a need. Keep receipt search independent of full `/api/data` bootstrap and dashboard totals.
4. Add a touch-friendly Receipts screen accessible to cashiers without opening financial reports. Show order reference, token, date/time, total, payment method and cashier. Include loading, no results, retryable error and older-results states. Cancel stale requests when filters change or the session ends.
5. Fetch the canonical saved receipt on selection, then open the existing receipt modal. Show original saved prices, taxes, options, notes, tender/change when available, cashier and token; do not rebuild from today's menu or tax settings. Keep historical reprints separate from any active customer-display confirmation.
6. Search requires the local POS server. If it is unavailable, explain that lookup cannot be confirmed and offer retry. Keep any active cart and durable recovery copies. Do not present a partial browser cache as complete receipt history.
7. On database restore/change, revoke stale result selections/cursors and clear receipt search state along with replaceable caches. Ask the user to search again against the restored database.

## Verification before completion

- Cashier can locate a saved sale from a previous date and another cashier at this store, without seeing cost, profit, credentials or reporting access.
- Repeated tokens on different days select the correct receipt; full/legacy references work; invalid filters, large ranges/pages, unauthorized access and injection inputs are rejected safely.
- Pagination remains stable with equal timestamps and newly created sales. Verify search performance against a large disposable history, checking index/query plans rather than relying only on tiny fixtures.
- Opening/reprinting old receipts preserves cart contents, current checkout identity, live customer confirmation and every ledger/counter. Printer failure allows retry without another sale.
- Old menu/tax changes do not alter receipt amounts. Logout, stale fetch responses, offline server and restore-generation changes cannot show misleading search results.
- Run meaningful server/component tests, relevant regressions, type checking and renderer/server builds. Verify the resulting screen in a disposable browser/app instance when automation is available. Do not restore or write live sales during testing.

## Outside this task

Kitchen stages, refunds/voids, payment edits, receipt deletion, shift reports, cross-branch access, scheduled backups and a complete `/api/data` pagination/report redesign are separate tasks.

## Delivered behavior

- Receipts navigation is available to cashiers, managers and admins. Cashier navigation still excludes reports, menu/staff maintenance and settings. Fixed the previous App-level rule that allowed cashiers to select only Order Line.
- Read-only `/api/receipts` returns 25 safe summaries per page, with a maximum page size of 50. Date ranges cover up to 31 business days. Full exact order references search all dates; tokens require a single selected business date. Matching legacy timestamps use the store's configured timezone/cutoff, including daylight-saving changes.
- `/api/receipts/:id` reads the canonical committed snapshot. Cancelled receipts are excluded. Cashier detail strips the existing cost/profit fields recursively; summaries explicitly select only receipt fields. Pending browser copies are never presented as saved history.
- Pagination uses timestamp/ID cursors bound to filters, store timezone/cutoff and database generation. New date indexes support date-range/legacy lookups. No order numbers, stored dates or historical amounts are rewritten.
- Search and receipt-detail requests are cancellable and time-limited. Old responses cannot open a receipt after filters, session or screen changes. Server errors offer retry without falling back to a misleading complete browser history.
- Reused the existing receipt modal/printing utility. Saved cash receipts also show original tender/change when available, including copied text. Kept Order Line and its drawer mounted but hidden during lookup to preserve cart lines, payment choice and the entered tender. The header's mobile-cart action returns to Order Line before opening it.
- The current live customer confirmation stays separate from historical previews. Lookup/reprint has no checkout, payment, stock or token mutation path.

## Browser verification

- Verified through the in-app browser on an isolated database at port 60621. Preserved the original preview's one-item cart.
- Created a synthetic cashier test session on a separate browser origin, added one Rs. 60 cart line and selected Rs. 2,000 tender. Opened Receipts using cashier navigation, found another operator's October 15 receipt by its full reference while today's date was November 1, opened its saved receipt with original cash/change, then returned to the order. The one cart line and Rs. 2,000 tender remained unchanged.
- Screenshots are saved under `docs/audits/receipt-lookup/`. No live sale/database was changed. No physical printer output was initiated; dispatch/failure/retry is covered by component tests. The preview uses the Node server and built renderer, not an installed Electron package.

## Verification results

- `npm test -- --maxWorkers=1 --reporter=dot`: **293 tests across 41 files passed**, including all existing backup/restore/auth/money/numbering/inventory/recovery tests and 16 receipt-lookup/integration cases.
- Disposable-server coverage verifies role enforcement, cashier financial-field stripping, cross-cashier saved snapshots after menu edits, full/legacy references, daily token ambiguity, validated filters/cursors, stable paging during insertion, and timezone/cutoff/DST boundaries. A 10,000-order history verifies bounded pages, date-index query plans and byte-identical database contents after reads.
- Client/component tests cover stale bodies after session changes, request cancellation, filter changes, paging, retryable server failure and canonical saved-only detail. The cashier App integration test confirms reprinting keeps its current cart, entered tender, live customer confirmation, sale count and numbering. Existing printer failure/retry coverage also passes.
- Two checkout-to-receipt tests initially used a one-second modal lookup before durable completion. They now await Saved using the existing five-second completion budget before inspecting printing; multi-action integration scenarios use a bounded 15-second test timeout. No checkout timeout or production retry policy was changed.
- Type checking, temporary renderer/server builds, Electron configuration checks and diff checks passed. Physical paper output and an installed Electron run remain outside this verification.
- The repository/live database was not opened for writes or migrated. Its original size and modification timestamp remain unchanged. Only the isolated QA database, temporary build files and source/tests/docs were changed.
