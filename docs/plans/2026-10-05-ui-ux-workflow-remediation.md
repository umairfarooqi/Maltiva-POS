# UI and UX workflow remediation plan

Date: 2026-10-05
Status: Implemented and verified after the user authorized “start on plan”.
Audit: [Current findings](../audits/frontend-ui-ux-audit-2026-10-05.md).

## Objective

Make the current POS reliable and efficient to operate: preserve customization, enable precise cart correction, provide honest management/transaction feedback, and complete mobile, keyboard, settings and reporting flows. Retain the established minimalist dark/light design.

## Working rules

- Inspect the current implementation and existing tests before each phase; historical plans are background, not proof of current state.
- Preserve staged changes and keep each new phase reviewable. Do not stage everything indiscriminately.
- Do not modify live SQLite data or runtime database files. Use isolated fixtures for persistence tests.
- Preserve money schemas, quote review, pending outbox, recovery, and idempotency semantics.
- Reuse semantic theme tokens and existing components. Extract a shared dialog primitive where repeated behavior warrants it; avoid unrelated dependencies or architecture changes.
- Track status and evidence below as implementation proceeds. Implementation was authorized on 2026-10-05. Record any remaining limitations explicitly.

## Phase 1 — Order customization and cart correction

Findings: UX-01, UX-02.
Files: `src/App.tsx`, `src/components/CartDrawer.tsx`, `src/components/VariationModal.tsx`, existing checkout/print tests.

- [x] Accept and retain notes in the cart; preserve them in server payloads, receipts, recovery and customer updates.
- [x] Show selected options and notes beneath each cart line, with readable wrapping.
- [x] Add labeled quantity and removal actions for each exact cart line.
- [x] Support editing customization in place, preserving cart-line identity and every other line.
- [x] Avoid merging lines whose customizations or notes differ.
- [x] Disable mutation controls during locked/uncertain checkout; explain the lock.
- [x] Make clearing a populated cart recoverable through Undo or explicit confirmation.

Acceptance: a note such as "No onions" reaches the kitchen receipt and customer display; decrementing one line to zero removes only that line; changing toppings recalculates totals correctly; recovery never creates duplicate sales.
Verification: focused customization/edit/remove tests plus existing sale-checkout and print suites; browser check with two differently customized copies of the same product.

## Phase 2 — Safe product and category management

Findings: UX-03, UX-04, UX-10.
Files: `src/components/ManageDishesView.tsx`, `src/services/api.ts`, `src/App.tsx`.

- [x] Preserve variation-group structure and IDs when editing unrelated fields.
- [x] Represent required/single/multiple selection rules without flattening them.
- [x] Await successful product-delete acknowledgment before removing UI/cache state. Do not simulate an offline deletion unless a durable operation queue exists.
- [x] Keep confirmation dialogs open while deleting; show failures in context.
- [x] Add saving states and duplicate-submit guards for dish, deal, category and stock operations.
- [x] Retain entered data after failure and focus actionable errors.

Acceptance: a price-only edit leaves required sizes unchanged; failed deletion retains the product; repeated Save clicks create one operation; failed stock/category changes preserve form data.
Verification: HTTP/network-failure and repeated-submit regression tests; management browser checks.

## Phase 3 — Customer transaction state and long orders

Findings: UX-06, UX-08.
Files: `src/App.tsx`, `src/components/CustomerDisplayWindow.tsx`, `tests/customer-display.test.tsx`.

- [x] Store live transaction confirmation separately from the receipt-preview selection.
- [x] Prevent historical receipts and draft previews from replacing the live customer confirmation.
- [x] Preserve honest saved/pending/rejected transitions and clear confirmation when the next cart begins.
- [x] Define/reset confirmation lifetime explicitly; retain until a new transaction unless a different policy is selected.
- [x] Bound the order list on counter monitors, reveal the newest added/changed line, and indicate hidden rows without hiding the total.
- [x] Refresh customer-facing store settings across windows and handle malformed/unavailable state gracefully.
- [x] Preserve current product photos, fallback images, full names, notes and quantity badges.

Acceptance: closing or browsing receipts does not change the current customer's confirmation; pending never implies success; a 20-line order keeps total and latest activity visible; contact changes appear without reloading.
Verification: cross-window/event and state-transition tests; counter-monitor check at 1024×768 and 1280×800, plus narrow layout.

## Phase 4 — Semantic controls, dialogs and mobile categories

Findings: UX-07, UX-11.
Files: order/product views, variation/receipt/management modals, cart/sidebar drawers; proposed shared `src/components/ui/Dialog.tsx`.

- [x] Replace clickable div-only actions with semantic buttons, avoiding nested interactive controls.
- [x] Add a mobile category selector and accessible create/edit/delete entry points.
- [x] Standardize dialog labeling, initial focus, focus containment, Escape behavior, background interaction blocking and focus return.
- [x] Keep dialogs open when a consequential request is running; prevent accidental repeat actions.
- [x] Replace browser alerts with inline required-option feedback and focus the missing choice.
- [x] Associate form labels with inputs; expose selection states and ensure practical touch targets.

Acceptance: checkout and management work with keyboard only; focus never escapes an open modal; Escape restores the trigger; phone users can filter and manage categories; long content does not clip controls.
Verification: keyboard/focus tests and manual keyboard walk-through; dark/light desktop and phone checks. Browser verification is required for sizing and clipping; jsdom tests alone do not establish responsive correctness.

## Phase 5 — Connect settings and define inventory behavior

Findings: UX-05, UX-09.
Files: settings, order line, stock badge, API/pricing/checkout and print paths as required.

- [x] Resolve the stock policy before dependent ordering/server changes.
- [x] Block unavailable items immediately with a reason; make sold-out behavior match the selected stock policy.
- [x] If strict stock enforcement is selected, validate aggregate quantities authoritatively and atomically across duplicate product lines and concurrent checkouts. Define offline recovery outcomes.
- [x] Define deal stock versus bundled-product stock before enforcing component inventory.
- [x] Connect global low-stock threshold using documented precedence; keep explicit per-product settings.
- [x] Generate a labeled sample receipt for Print Test Slip without requiring or modifying a cart and without creating a sale.
- [x] Connect auto-print only through a supported print path; label browser-dialog limitations accurately.
- [x] Remove or clearly label settings whose promised behavior is unavailable rather than displaying false success.

Acceptance: stock feedback and sale outcomes agree; test printing works with an empty cart; printer settings have observable effects; existing pending sales are not discarded under the chosen stock rules.
Verification: isolated inventory/transaction tests where enforcement changes; empty-cart sample receipt test; supported browser/Electron print-path check without submitting a live sale.

## Phase 6 — Reporting boundaries and payment coverage

Finding: UX-12.
Files: `src/components/DashboardView.tsx`, `src/components/ProfitLossView.tsx`; small shared date-range helper if needed.

- [x] Define Last 7 Days as today plus six previous local calendar days, unless explicitly choosing a rolling window.
- [x] Use local start-of-day and exclusive next-day end boundaries for custom ranges.
- [x] Validate reversed/incomplete custom ranges with clear messages.
- [x] Cover Cash, Card and Scan consistently in filters, summaries, labels and totals.
- [x] Preserve saved-sale-only totals, cancellation handling and authoritative profit calculations.

Acceptance: Pakistan local-midnight transactions fall in the correct dates; end-date boundaries do not include the following day; Scan has an explicit breakdown that reconciles to overall totals.
Verification: fixed-clock boundary tests, including local timezone and range edges; report browser and print checks.

## Completion gate

- [x] All twelve findings have a verified resolution or an explicitly documented deferred decision.
- [x] Focused tests and required existing recovery/money/print suites pass for the affected phases.
- [x] `npm run lint`, `npm run build` and `git diff --check` pass.
- [x] Browser checks confirm both themes, keyboard flows, phone layouts and counter-monitor customer display.
- [x] Record tested print path; do not claim physical printing without testing it.
- [x] Record any backend/API changes and decision-dependent limitations.
- [x] Confirm original staged work remains intact and no runtime database files are staged.

## Progress log

| Phase | Status | Evidence |
|---|---|---|
| 1 — Customization/cart | Implemented | Workflow regression tests and browser checks |
| 2 — Management | Implemented | Workflow regression tests and browser checks |
| 3 — Customer display | Implemented | Workflow regression tests and browser checks |
| 4 — Accessibility/mobile | Implemented | Workflow regression tests and browser checks |
| 5 — Settings/inventory | Implemented | Strict aggregate/atomic stock tests; sample receipt and print dispatch tests |
| 6 — Reporting | Implemented | Workflow regression tests and browser checks |

## Implementation decisions and evidence

- **Inventory:** user selected strict insufficient-stock blocking. Menu, customization and cart increments respect cached available quantities; quotes aggregate all lines per product and recheck inside the SQLite sale transaction. A reviewed quote does not reserve stock. A competing or recovered sale that no longer fits stock is rejected for review, retaining its recovery identity. Offline submission remains pending until the server confirms it; no success or stock reservation is promised offline.
- **Deals:** each deal has its own inventory quantity, matching the existing ledger. Bundled product descriptions are not a component-stock ledger; component stock is not deducted a second time.
- **Low-stock defaults:** normalization already gives every product a threshold, so the global setting is explicitly a default for newly created dishes/deals. Existing per-product thresholds remain authoritative. The value persists on the server.
- **Confirmation:** separate from receipt browsing, retained on this device until the next cart starts, logout, or Settings → Reset confirmation. Pending/rejected recovery updates remain honest. Broadcast updates continue if browser storage is unavailable.
- **Printing:** sample receipts are unpaid and explicitly labeled test-only, independent of a cart or sale. Auto-print opens the browser dialog once for the current confirmed checkout; opening historical receipts does not trigger it. Kitchen enablement selects both slips. Print preview was inspected in the browser; print dispatch is verified with a mocked `window.print`. Physical printing and native unattended printing were not tested or implemented.
- **Settings:** void permission and shift tracking are disabled and labeled unavailable. PIN changes are labeled offline-only. Export/clear actions accurately describe browser cache data rather than claiming server database backup/deletion.
- **Reports:** today plus six prior local calendar days; custom end dates use exclusive next-midnight boundaries. Cash/Card/Scan filters and summaries are explicit; other/legacy payments are shown separately so breakdowns reconcile.
- **Browser evidence:** actual POS cart/customizer keyboard flow, mobile categories at a measured 390×844 layout viewport, light receipt preview, and a temporary isolated twenty-line customer-display fixture at 1024×768, 1280×800 and 390×844. Desktop totals/latest lines stayed visible and narrow layout did not overflow horizontally. The fixture was removed after verification. The existing two-item basket was not changed.
- **Git/data:** original staged snapshot retained; remediation remains unstaged. Runtime SQLite/WAL/SHM and migration backups were neither edited directly nor staged. Persistence tests use isolated temporary databases.
- **Validation:** full suite passed **126 tests across 19 files** (`npm test -- --maxWorkers=2`), followed by 9 passing customer-display tests after hardening malformed-message handling. TypeScript, production build, and diff whitespace checks passed. Final checkout-lock UI refinements passed 32 affected checkout/layout/workflow tests; stacked-dialog cleanup then passed 19 workflow/layout/login tests, including a new simultaneous-unmount regression. Two workers are used to avoid this host's excessive parallel jsdom startup contention.

### Final acceptance

All twelve findings have implemented resolutions. Browser proof of cart controls is saved as `cart-remediation.png` in the task visualization directory. Original staged files remain staged at their original snapshot; later application/test/doc work is unstaged. No runtime database file is staged. Physical-printer behavior remains unverified; the implemented print path is the browser dialog.
