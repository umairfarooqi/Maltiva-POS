# Faster POS loading

Date: 2026-11-01
Updated: 2026-11-02
Branch: `codex/faster-pos-loading`
Status: Phase 1 implemented; existing regression checks pass. Recheck found two cache races to fix before sign-off. Changes uncommitted; Phase 2 remains planned.

## Findings

- `/api/data` loads all historical order IDs and calls `loadOrder` for every ID. Each call separately reads the order, its items, cash payment and database generation. Query count grows by about four per sale in history, before serializing the entire history.
- Products have the same smaller N+1 pattern: one ID list plus one lookup per product.
- Startup, recovery refresh and every successful checkout call the same full-data endpoint, even when the immediate need is current menu/stock. Browser cache parsing/serialization also grows with history.
- Several React initializers eagerly call storage getters on every render, including complete saved history and the current draft. These should be lazy one-time initial reads.
- Dashboard and P&L currently calculate from the complete order array. Simply truncating bootstrap orders would silently undercount reports. Pending/rejected/acknowledged recovery and the saved receipt must remain safe.

## Phase 1: implement now

1. Batch full order-history reads into one read transaction: orders, items, cash payments and generation, assembled in memory without per-order SQL. Reuse the same snapshot mapping as single-order reads. Batch catalog product reads too.
2. Add an explicitly scoped catalog/menu refresh that excludes historical orders, inventory logs and staff data. Keep the existing full `/api/data` behavior for compatibility and complete reporting.
3. After a saved checkout or replay, use the lightweight catalog refresh and canonical acknowledged orders already in recovery/cache. Do not send the full historical ledger again merely to refresh stock. Preserve confirmation, receipt, pending keys and current cart.
4. Load complete report data on entering Dashboard/P&L. Show loading/error/retry instead of displaying a partial/stale array as a fresh report. Guard session changes and late responses.
   Preserve complete in-memory history during recovery when optional browser-cache writes fail. Recovery acknowledgments must remain readable from IndexedDB without a history download.
5. Verify 1,000/10,000-order histories, query counts, response size, canonical financial snapshots, privacy, report completeness, recovery, receipt reprinting and existing regressions. Use disposable databases and temporary builds; leave live sales untouched.

## Phase 2: next, after Phase 1 measurements

- Separate the small checkout bootstrap/cache from historical report data. Bound saved receipt cache while retaining every pending/rejected recovery copy. Keep Last receipt and startup draft reconciliation correct.
- Move reporting to server-side range queries/aggregates with complete totals, plus paged drill-down. Only then remove full history from initial checkout loading.
- Measure renderer work, cache writes and image decoding; optimize menu images/rendering based on evidence. Avoid changing business calculations or disguising incomplete data as a speed improvement.

## Acceptance and limits

Phase 1 should remove per-sale history queries and full-history network refreshes after checkout. Full startup response size and the old browser history cache still grow with history until Phase 2. Report data remains complete. This plan does not add refunds, kitchen stages, new financial rules or deployment.

## Implemented Phase 1

- Added shared snapshot mapping and four-query transactional history loading. Single receipt/save responses retain the same mapping, amounts, item ordering, customization and tender/change. Catalog products use one query.
- Added authenticated `/api/data?scope=catalog` with explicit `historyIncluded=false`. It omits historical orders, tables, staff and inventory logs; cashier cost stripping still applies. Default `/api/data` continues to return complete history.
- Saved checkout/replay refreshes only catalog and stock. A failed post-save refresh cannot lock or resubmit the confirmed sale; the existing sync action/heartbeat retries refresh. Durable recovery snapshots are merged without writing the full cache again on each heartbeat.
- The post-save refresh runs in the background, so a slow catalog response does not hold the new-order lock. Superseded responses and responses arriving during another checkout cannot replace active catalog state.
- Report entry fetches complete server history behind loading/error/retry states. A catalog-only response cannot count as complete history. Recovery preserves server-confirmed orders held in memory even if localStorage is full. Reselecting the active report does not leave it stuck loading.
- Successful checkout merges its canonical response into memory directly, so Last receipt remains available immediately when the optional order cache is full; existing complete in-memory history is retained too.
- History, draft, initial basket serialization and other storage-based React initial state are read lazily once per mount rather than on every render.
- Pending-count notifications discard superseded results, and sync uses the latest recovery snapshot rather than an older response count.
- Receipt changes were committed separately as `451c06a` on `codex/receipt-lookup-verified`. This performance phase is separate and uncommitted on its own branch.

## Measurements and verification

- Disposable history fixtures at 1,001 and 10,001 orders use exactly four SELECTs to assemble all history. The old history path used an ID query plus four SELECTs per order.
- At 10,001 fixture orders, full UTF-8 JSON was **17,554,030 bytes**; catalog JSON was **9,078 bytes**. This measures the refresh response reduction, not a claim that startup now downloads only 9 KB.
- Focused coverage includes cache-write failure/durable acknowledgments, report completeness/loading/offline handling, stale session bodies, the post-sale request path, refresh failure without checkout lock, and avoiding repeated storage reads.
- All 38 focused checkout, app-smoke and client-loading checks pass. Earlier broad runs exposed timing limits and background replay crossing test boundaries; checkout teardown now waits for replay before replacing its fixture database and transport. Integration waits were adjusted without changing sale-safety assertions.
- Final complete run: **308 tests passed across 43 files** (`npm test -- --maxWorkers=1 --reporter=verbose`). The existing session-expiry fixture now expires a full minute in the past rather than one millisecond, and asserts that its database update changed one row; authentication implementation is unchanged.
- TypeScript (`npm run lint`), Electron configuration checks, production renderer build and bundled server build pass. Builds were written under a new temporary directory. Renderer output is about 498 KB JavaScript (134 KB gzip); the imported dish image is about 963 KB, a candidate for the later asset measurement phase.
- No live database was migrated or written and no production server was restarted. Temporary databases/build outputs were used. Phase 2 remains planned.

## Follow-up verification, 2026-11-02

The fresh 308-test suite passed again, and the production build was exercised in the real browser against a disposable 10,001-order fixture. Sale, token, receipt, new draft, reload and older receipt lookup worked. Live response logs confirmed the 9 KB post-save catalog refresh. Two additional controlled probes exposed a session-change race during asynchronous bootstrap cache writes and out-of-order catalog cache writes; fix these before sign-off. A 10,002-row report rendered 170,240 DOM elements and produced interaction/inspection timeouts, confirming the need for bounded reporting. See [full recheck and evidence](../audits/loading-recheck-2026-11-02/report.md).


## Race fixes and bounded rendering, 2026-11-02

- Bootstrap defers all snapshot cache writes until recovery reads finish, then verifies both session token and caller ownership. Session-change/cancellation errors exit instead of using the offline fallback; offline recovery verifies ownership again after its reads. App guards bootstrap, reports and recovery error state against obsolete sessions.
- Catalog assigns ownership when each request starts and verifies the latest request plus App's session/request/checkout guard before caching. An obsolete request rejects and cannot update UI or browser stock.
- Daily Sales displays 50 rows per page with previous/next/last controls and filter reset. All sales, payment, count, average and comparison totals still use the complete matching history. Receipt previews use the selected canonical order.

### Next phase: server totals before bounded startup

This remains planned, not implemented by the race/rendering fix. Checkout startup still downloads complete history, and report filtering/aggregation still runs over complete history in memory.

1. Define an authenticated report endpoint accepting validated start/end instants and payment filter, returning complete integer-paisa sales/cost/profit, order counts, payment breakdowns, comparison totals, database generation and a bounded page of row summaries. Preserve the current report date semantics explicitly; any business-day change needs separate approval and tests. Dashboard and P&L must share the same canonical saved-snapshot rules, rounding, cancelled-order exclusions and legacy handling.
2. Compute aggregates over every matching committed order in a single consistent SQLite read transaction; apply page limits only to detail rows. Use stable timestamp/ID cursors bound to filters and database generation. Keep report permissions and cost/profit access enforced server-side. Fetch full receipt items only when opening a selected receipt. Compare every aggregate to the existing complete-history calculations at 1,000/10,000+ orders, boundaries, legacy records and each payment mode; inspect query plans before adding indexes.
3. Switch both Dashboard and P&L to the complete server totals and paged rows, with loading/error/retry and request/session ownership guards. Never substitute a partial cache or a detail page for totals. Specify how new sales affect page snapshots and refresh totals/rows together.
4. Only after both reports no longer depend on bootstrap history, add an explicit checkout bootstrap scope with menu/settings and the authenticated operator's latest receipt. Resolve submitted draft identities through bounded canonical key lookup plus the durable outbox. Preserve every pending/rejected/acknowledged recovery copy, database-generation quarantine, cart draft and Last receipt. Older receipts continue through the existing paged receipt lookup.
5. Bound only replaceable saved-receipt cache, independently of durable recovery. Migrate the old cache without dropping unresolved attempts, and preserve optional-cache-quota behavior. Avoid writing full report histories back into checkout storage. Verify crash/reload, lost acknowledgments, session changes, restore and offline recovery before removing full startup history.
6. Measure startup bytes/queries, cache serialization and browser interaction on disposable large histories. Full-history compatibility stays available until consumers are migrated and complete financial parity is proven. No live migration, deployment or restart is part of this plan.
