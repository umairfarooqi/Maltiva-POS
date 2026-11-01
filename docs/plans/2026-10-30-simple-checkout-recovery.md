# Simple checkout and cashier-safe recovery

Date: 2026-10-30
Status: Implemented and verified on `codex/checkout-recovery-ownership`.

## User flow

Complete Order → create order, assign numbers and save payment/stock atomically → confirm Saved → print → new order. There is no kitchen workflow in this phase. Printing/reprinting never creates a sale or changes its numbers.

## Implementation plan

- Store the authenticated original cashier, reviewed order identity and basket hash in a server-side checkout-intent record when quoting a sale. This record is not an order, payment or stock reservation.
- Recovered reviewed intents retain their original cashier even when another authenticated staff member submits them. Record the actual submitting staff separately. Never use an unsigned browser name/role as proof of ownership.
- Older/unreviewed offline intents cannot be silently attributed to someone else: keep them durable and ask the original cashier to review them. Other pending sales must continue syncing around a blocked intent.
- Resolve already committed keys before ownership/pricing checks so lost acknowledgments and historical retries still return exactly the original saved sale and token.
- Force new server-created sales to `completed`, ignoring client status fields that could hide paid transactions from reports. Keep historical statuses unchanged; do not add preparing/ready/collected states.
- Preserve submitted identity through double taps, crashes, session changes and printing failure. Verify against disposable databases, including server restart and multi-user recovery, plus component tests for printing/reprinting.

The live database must not be opened during implementation. Pending copies and existing history must not be deleted. No automatic transfer workflow, kitchen screen, printer worker or deployment is added.

## Delivered behavior

- New sales are completed financial transactions. Order, daily token, payment and stock changes commit together before the saved receipt is shown.
- Checkout reviews persist the authenticated original cashier on the server. Recovery preserves that snapshot and records the authenticated submitting staff separately, including after logout or server restart.
- Unregistered older/offline sales stay pending when another cashier attempts recovery. Their ownership message is visible, their durable copy remains, and unrelated sales can continue syncing.
- Repeated completion or recovery returns the original sale and numbers. Committed receipt snapshots remain recoverable even if the catalog or stock changes later.
- A saved sale survives printer failure. The empty-cart **Last receipt** action reopens the current user's latest saved receipt without another checkout. The cart **Print** action opens an unpaid draft; its previous event-handler bug incorrectly selected a test slip.
- Full-suite verification found that the newer dish screen had lost the stock-field protections from `6a45b7b`. Restored the same read-only existing-stock fields, opening-stock validation and omitted quantity in edit callbacks while preserving its layout. Server-side stock protection was already intact.

## Compatibility and limits

- Schema changes add `checkout_intents` and nullable original receipt fingerprint/submitting-staff columns to orders. Historical order statuses and records are preserved.
- An unregistered pending sale needs its original cashier to sign in and review it. An unavailable original account needs administrator attention; ownership is never silently transferred.
- Updated builds must be loaded for these changes to take effect. No live database was opened, production process restarted or deployment performed.
- Automated print tests verify dispatch failure and retry, not physical paper output. Physical printer and installed Electron checks remain manual.

## Verification

- `npm test -- --maxWorkers=1 --reporter=dot`: **252 tests across 34 files passed**. Covers original cashier attribution across logout/restart, changed basket ownership, price re-review, durable blocked recovery, committed-key replay, double taps, saved receipt printing failure and reprint, plus existing inventory/auth/money/numbering checks.
- Type checking, renderer and server bundles, Electron configuration checks and `git diff --check` passed. Build artifacts went to temporary directories.
- Initial two-worker full run exposed the stock-editor regression and checkout UI timeouts. After restoring stock protections, the entire suite passed with one worker; all checkout UI tests also passed separately. Existing harmless jsdom navigation and React act warnings remain.
