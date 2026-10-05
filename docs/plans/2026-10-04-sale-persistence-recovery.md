# Phase 1: sale persistence and recovery

Spec: `docs/MALTIVA_POS_SPEC (1).md`, sections 16.5–16.7. This report records the completed phase-1 scope. Subsequent work is recorded in [Phase 2A: authoritative prices, integer paisa and profit](2026-10-05-authoritative-money-and-profit.md).

## Scope and decisions

- Preserve existing uncommitted work; implement in the current feature checkout.
- Keep current money, identity, order/token numbering and fulfilment model. Their replacement belongs to later phases.
- Add basic payment and stock-movement persistence to satisfy the phase-1 atomic lifecycle test. Do not introduce split-payment UX or authoritative pricing.
- Stage requests in IndexedDB before transport, so a crash or lost acknowledgment retains the same key. Only network failures/timeouts leave a pending sale; HTTP errors retain a durable rejected snapshot, exclude it from replay and pending counts, and keep the draft for a decision.
- Reconcile a submitted draft before allowing cart edits. A matching pending/saved basket belongs to the submitted sale; a rejected basket remains available for review and explicit retry.
- Share in-flight transport by sale key. Merge recovery snapshots against the latest acknowledged cache so delayed bootstrap cannot erase a 201 received meanwhile.
- Pending-status queries reconcile this browser's submitted keys with SQLite. The browser outbox owns the pending count; the server cannot know about requests it has never received.
- Preserve legacy queued orders by migrating them to IndexedDB before removing the legacy queue. Wipe and logout do not delete pending orders.

## Tasks

- [x] Add isolated-server tests for 201 persistence, rollback of every ledger, and idempotent replay.
- [x] Repair atomic creation; migrate idempotency key column; load complete snapshots; add pending-status endpoint.
- [x] Add IndexedDB outbox and recovery tests for timeout/network errors, HTTP rejections, lost acknowledgment, bootstrap merging and legacy queue migration.
- [x] Implement automatic serialized replay, cache merging and safe local draft persistence.
- [x] Add UI tests for saved/pending/rejected, draft retention, receipt pending marks and persistent count; implement feedback and protect wipe/logout.
- [x] Run focused lifecycle tests, complete suite, TypeScript, renderer/server build and independent review.

## Acceptance and review focus

- Valid sale: one order, its items, payment and stock movements; any failed step rolls everything back.
- Duplicate request/replay: one sale and one stock deduction; respond 201 with original snapshots.
- Interrupted server: durable pending sale survives reload, syncs once after restart and remains visible during bootstrap.
- HTTP 4xx/5xx: show reason, keep cart, do not misclassify as offline or print a success receipt.
- IndexedDB write failure: retain cart and do not send a request that cannot be recovered.
- Concurrent replay, response loss, user logout and cached-history clearing must not lose or duplicate pending sales.

The previously deferred 16.7 tampered-price, Rs.333 tax-agreement and tax-exclusive-profit tests are now covered by the implemented Phase 2A plan. Server-issued number stress tests and role authorization remain later work. The linked plan records implementation and verification evidence.

## Verification (2026-10-04)

- `npm test -- --reporter=dot`: **56 passed, 10 files passed**, exit 0.
- `npm run lint`: TypeScript passes, exit 0.
- `npm run build:electron`: renderer and server builds pass, exit 0.
- `npm run test:electron`: configuration checks pass, exit 0.
- Independent review: no remaining phase-1 blockers after fixes and regression proofs.

Section 16.7 phase-1 evidence:

| Lifecycle | Test file | Result |
| --- | --- | --- |
| Valid 201 persists order/items/payment/stock; failure at each ledger rolls back rows and stock | `tests/sale-persistence.test.ts` | Passed |
| Duplicate key returns original sale without additional stock deduction | `tests/sale-persistence.test.ts` | Passed |
| Stopped server and lost acknowledgment survive client/server restart and replay once | `tests/sale-server-restart.test.ts` | Passed |
| Durable pending/rejected snapshots, timeout, bootstrap races, concurrent replay, cache quota | `tests/sale-recovery.test.ts` | Passed |
| Saved/pending/rejected decisions, submitted crash drafts, automatic replay, wipe/logout, pending receipt | `tests/sale-checkout.test.tsx` | Passed |

Tests use temporary isolated databases; the user's live SQLite database was not started or modified. Existing empty-image warnings and jsdom's unsupported page-reload message remain non-failing. No backup restore feature was introduced (phase 6).

The user requested committing the current work on a new branch, `feature/phase1-sale-recovery`. The commit includes the existing staged UX changes alongside phase-1 sale persistence, recovery and lifecycle tests. Phase 2 remains deferred.

## Recovery review follow-up (2026-10-05)

- An unreadable, missing or mismatched HTTP 201 snapshot now remains pending under the original idempotency key. A 201 may already represent a committed sale, so it must not be treated as a rejection that permits editing and resubmitting the same basket under a new key. HTTP errors still require an explicit cashier decision.
- A confirmed sale whose optional localStorage history write fails is retained as a saved snapshot in IndexedDB. Saved snapshots are excluded from replay and pending counts, and bootstrap merges them even when offline. They also supersede stale cached rejections after an explicit retry succeeds.
- Bootstrap cache writes are optional: full localStorage no longer blocks recovery or prevents fresh server data from reaching the UI. Submitted crash drafts reconcile against the durable saved snapshots before cart edits resume.
- Added regression coverage for uncertain 201 bodies, cache quota failures, reload, rejected-sale retry, cashier draft reconciliation and malformed acknowledgments from a real server followed by restart. Tests use temporary databases; the live SQLite database was not modified.

Verification in this checkout:

- `npm test -- --reporter=dot`: **64 passed, 10 files passed**, exit 0.
- `npm run lint`: passed, exit 0.
- `npm run build:electron`: renderer and server builds passed, exit 0.
- `npm run test:electron`: configuration checks passed, exit 0.
- `git diff --check`: passed.

Dependency restoration: regular `npm ci` attempted a native SQLite compilation and failed because the installed Visual Studio lacks a VC++ toolset. `npm ci --ignore-scripts --no-audit --no-fund` restored the locked packages; `npm rebuild electron esbuild --no-audit --no-fund` also passed. The bundled `better-sqlite3` Windows binary passed an in-memory query and the server lifecycle tests. Electron validation covers builds and configuration; the desktop application was not launched. Package manifests and the lockfile were unchanged. Existing empty-image and jsdom navigation warnings remain non-failing. Phase 2 money, accounting, permissions and authentication work remains deferred.
