# Preserve stock during menu edits

Date: 2026-10-30
Status: Implemented and verified on `codex/preserve-stock-on-menu-edit`.

## Plan

- Existing-product updates change catalog fields only. Server-side field allowlisting ignores stock snapshots from old or tampered clients and returns the actual stored quantity.
- The client omits stock from update payloads. Dish/deal editors show read-only stock snapshots with directions to Adjust Stock; new products retain validated whole-number opening stock.
- Sales and explicit stock deltas remain the paths for changing an existing quantity. Use immediate transactions for stock adjustments so concurrent operations read the latest committed quantity before writing/logging it.
- Verify stale name/price/deal edits after sales, restocks and waste; repeated/competing requests; acknowledged quantities in the UI; invalid opening stock; and existing numbering/money/auth/recovery regressions.
- Preserve the separate uncommitted layout work in `ManageDishesView` and `OrderLineView`. Do not open or modify the live database.

Catalog edit versioning, opening-balance audit events, recipe/component inventory and background catalog synchronization are outside this specific stock-overwrite fix. The guarantee applies to normal POS/API catalog edits; the separate wholesale menu-import CLI remains a maintenance workflow outside this change.

## Results

- Numbering was reverified with all 222 tests passing and committed as `86a02b1` on `codex/server-order-numbering`. Separate layout changes were excluded from that commit.
- Existing product updates now allow catalog fields only, inside an immediate transaction. Old/tampered stock snapshots and creation timestamps cannot replace stored inventory. Deleted products return 404.
- Product-update transport omits quantity. Dish and deal editors show read-only stock snapshots and explain the Adjust Stock workflow; new products accept nonnegative whole-number opening quantities. Canonical responses refresh the client cache with the acknowledged actual stock.
- Stock adjustments use immediate transactions, retaining existing ledger rollback and operation-ID replay guarantees.
- Focused server tests reproduce stale edits after sales, restock and waste; concurrent sales, adjustments and edits across two server processes; adjustment replay/log rollback; and invalid/zero opening stock. UI tests cover both editors and payload/cache behaviour.
- `npm test -- --maxWorkers=2 --reporter=dot`: **238 tests across 33 files passed**. Type checking, renderer/server builds, Electron configuration checks and `git diff --check` passed. Build outputs used temporary directories; existing non-failing jsdom/React warnings remain.
- The live database was not opened or changed, and no production process was restarted. Updated builds must be loaded before this behaviour takes effect.
