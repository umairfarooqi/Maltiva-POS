# Older receipt lookup for cashiers

Date: 2026-11-01
Status: Planned only. Implement after the backup/restore commit.

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

Kitchen stages, refunds/voids, payment edits, receipt deletion, shift reports, cross-branch access, scheduled backups and a complete `/api/data` pagination/report redesign are separate tasks. This plan does not authorize those changes or begin receipt-lookup implementation.
