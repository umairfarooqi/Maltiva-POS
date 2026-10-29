# Server-issued order and pickup numbers

Date: 2026-10-30
Status: Implemented and verified, authorized by “plan and start”.

## Plan and decisions

1. Add persistent daily SQLite counters and a nullable business-date field on orders. Keep all historical numbers and recovery keys unchanged.
2. Allocate the order number and pickup token inside the same immediate write transaction as the sale, payment and stock ledgers. Rejecting or rolling back a sale also rolls back its counter allocation.
3. Issue globally unique order references such as `#F20261030-0001`. Pickup tokens start at 1 per business day and do not wrap at 100. The server computes the date using `settings.timezone` (default `Asia/Karachi`) and `settings.day_cutoff_hour` (default midnight, 0). No settings UI or shift workflow is added in this phase.
4. On the transition day, seed past valid legacy tokens for that business date; also skip existing order numbers in the new date-based namespace. Legacy rows retain their original values and are not forced into a new uniqueness constraint.
5. Resolve committed idempotency keys before allocation, repricing or stock validation. A replay returns the original saved numbers, even after restart or day rollover. Uncommitted pending sales receive numbers only when saved.
6. Remove browser order counters. Use stable UUID-based pending references for recovery; draft/pending/rejected receipts and customer confirmations must not present a guessed pickup token.
7. Test legacy preservation, transaction rollback, business-day boundaries, restart/replay, 1,000 sequential sales and 50 simultaneous sales across server processes sharing one disposable database. Run the existing recovery, money, authentication, UI and printing suites, type checking and builds.

## Boundaries

- Do not open or modify the live database during implementation/testing. Schema additions take effect on the next normal startup of the updated server.
- Preserve authentication/session work, integer money calculations and strict stock checks.
- Stale product edits overwriting stock, fulfilment status tracking and original-cashier recovery attribution remain separate changes.
- Daily business-date numbering does not change report date filters or implement shifts. Default midnight keeps the existing calendar-day reporting convention; a configured cutoff affects numbering only in this phase.

## Implementation and verification

- `src/services/orderNumbering.ts` adds idempotent schema initialization, date/cutoff handling, legacy seeding and transactional counter allocation. `server.ts` uses an immediate SQLite sale transaction and writes the issued reference into inventory logs. Client-supplied order/token/business-date values do not control saved numbers.
- `App` no longer derives numbers from browser history. New carts have no assigned number; submitted pending intents retain a UUID-based reference and unassigned token sentinel (0). Server acknowledgments supply receipt/customer-confirmation numbers. Rendered/copied provisional slips display “Awaiting save”, including legacy pending snapshots carrying old guessed tokens.
- Existing saved rows retain their numbers and nullable business date. New orders have a unique business-date/token index; legacy duplicates are preserved rather than rewritten.
- `npm test -- --maxWorkers=2 --reporter=dot`: **222 tests across 31 files passed**. Tests include 1,000 sequential sales, 50 simultaneous sales over two server processes sharing a temporary database, ten concurrent submissions of one recovery key, rollback/restart, date and cutoff boundaries, historical preservation, deleted-catalog replay and receipt/customer-display behaviour.
- `npm run lint`, renderer and bundled-server builds, `npm run test:electron`, and `git diff --check` passed. Build outputs were written into temporary directories. Existing non-failing jsdom navigation and React act warnings remain.
- The live database was not opened or modified, no production process was restarted, and physical printing was not exercised. Rebuild/restart the updated POS before the new schema and numbering behaviour take effect.
