# Frontend UI and UX audit

Date: 2026-10-05
Status: Findings implemented and verified; evidence and limitations are tracked in the linked remediation plan.

## Scope and evidence

Reviewed the current checkout, cart customization, product/category management, customer display, settings, reporting, and shared interactions. This is a source-based audit; not every failure was reproduced in a browser. Source references identify responsible files and functions rather than immutable line numbers.

The current implementation already includes semantic dark/light themes, a saved Appearance switch, unclipped product menus with keyboard navigation, stock labels, and customer-display welcome/order/confirmation states with product photos. Preserve these improvements.

This audit updates the current priorities from the October 3 audit and plan. Earlier findings about missing print targets or missing mobile drawer dismissal are not current findings. Do not infer completion from historical checkboxes or implement obsolete instructions. Customers, staff, tables, and Help Center components exist but are not reachable through the current App navigation; they are not new feature commitments.

## Findings

| ID | Priority | Finding | Evidence | Customer/staff impact | Recommended outcome |
|---|---|---|---|---|---|
| UX-01 | P1 | Customization notes are discarded | `VariationModal.handleAdd` sends notes; `App.handleAddVariationToCart` omits that argument and cart field | Kitchen instructions disappear despite being entered | Preserve notes through cart, sale, customer display, receipt and recovery |
| UX-02 | P1 | Cart lines cannot be corrected directly | `CartDrawer` ignores quantity/removal callbacks and omits selected options/notes | Customized lines cannot be conveniently corrected without restarting | Add line quantity, remove and edit actions; show customization details |
| UX-03 | P1 | Product deletion reports apparent success despite transport/HTTP failure | `App.handleDeleteProduct` removes immediately; `PosApi.deleteProduct` ignores non-success responses and catches network errors | Product disappears locally and can return on refresh | Commit removal after acknowledgment; retain item and explain failures |
| UX-04 | P1 | Editing a product rewrites its variation model | `ManageDishesView.openEditDishModal` flattens groups; `handleSaveDish` creates one optional multi-select group | Ordinary price/name edits can change required choices and selection behavior | Preserve group IDs, names, requirements, cardinality and option IDs |
| UX-05 | P1 | Stock labels disagree with ordering behavior | `OrderLineView` and `App.handleQuickAddToCart` do not block unavailable/zero-stock items; pricing checks availability but not quantity; sale persistence decrements stock | Unavailable items fail late; sold-out items can oversell | Establish a stock policy and make UI and authoritative server validation agree |
| UX-06 | P1 | Customer confirmation is coupled to receipt preview | `App` broadcasts `receiptModalOrder` as `lastPlacedOrder`; closing clears it, viewing another receipt replaces it | Confirmation disappears early or an old order is displayed | Separate live transaction confirmation from receipt browsing |
| UX-07 | P2 | Category navigation/management disappears on phones | `ManageDishesView` category sidebar uses `hidden md:flex` without a mobile equivalent | Mobile users lose filtering and category operations | Provide a labeled picker and accessible management entry point |
| UX-08 | P2 | Customer display lacks a long-order strategy and live settings refresh | Item list grows naturally; `CustomerDisplayWindow` reads settings only on mount | New items can leave the visible monitor area; branding/contact details become stale | Bounded live list with latest-item visibility and overflow cue; update settings live |
| UX-09 | P2 | Settings contain unconnected behavior and a silent test-print action | No behavior consumes auto-print/global threshold settings; `handleOpenPrintCurrentCart` returns for an empty cart | Controls imply functionality that does not execute | Implement connected behavior or accurately label unavailable features; sample receipt independent of cart |
| UX-10 | P2 | Management saves lack consistent progress/errors | Product saves lack request locks; category/stock submits lack visible error handling; delete dialog closes before completion | Duplicate requests, lost context, and unexplained failures | Disable repeated submissions and retain forms/dialogs with local actionable errors |
| UX-11 | P2 | Product/category interactions and modal accessibility are incomplete | Clickable divs; most overlays lack shared focus containment/dialog semantics; variation validation uses `alert` | Keyboard/screen-reader users cannot complete flows consistently | Semantic controls, accessible dialogs, focus restoration, inline validation |
| UX-12 | P2 | Date/payment report filters are incomplete | Dashboard starts seven days ago at midnight, parses date-only strings using UTC, and excludes Scan from payment selectors/summaries | Misleading period totals and missing payment breakdowns | Local calendar boundaries, explicit range semantics, all supported payment methods |

P1: incorrect order data, misleading transaction feedback, or consequential workflow failure. P2: usability, accessibility, and reporting consistency problems to address next.

## Decisions recorded during implementation

1. **Stock policy:** strict blocking versus an explicit permitted override. The audited code permitted negative quantities; implementation now blocks insufficient stock following the user’s choice. Do not silently impose strict stock enforcement as a visual-only change. Deal/component inventory treatment must be defined separately if component-level stock is required.
2. **Printer behavior:** browser printing versus an existing supported Electron/native path. Inspect current capabilities before promising unattended printing; browsers may require a print dialog.
3. **Customer confirmation lifetime:** proposed behavior is to retain confirmation until a new cart starts, with an explicit reset for privacy. Do not infer kitchen readiness or payment completion beyond available transaction data.
4. **Global low-stock threshold:** proposed precedence is a product threshold first, then a global fallback for products without an explicit threshold. Existing normalization supplies defaults, so preserve enough information to distinguish explicit values before implementing fallback.

## Constraints

- Preserve checkout idempotency, durable pending sales, recovery keys and authoritative money calculations.
- Maintain both themes and light receipt/report print output.
- Preserve current staged work. Keep later remediation changes separately reviewable.
- Do not edit, reset or stage live database, WAL, SHM or migration backup files.
- Do not add unrelated navigation/features or a new design style.
- Validate consequential behavior with focused regression tests, not tests that merely assert CSS classes.

Implementation sequence and acceptance criteria: [Remediation plan](../plans/2026-10-05-ui-ux-workflow-remediation.md).

## Resolution record

UX-01–UX-12 are addressed by the linked remediation plan. The implementation includes note retention and exact-line cart editing; acknowledged product/category/stock mutations with request locks; stable variation groups; strict atomic stock enforcement; independent live confirmation; responsive categories and bounded customer orders; shared dialog behavior and semantic controls; accurate settings and sample printing; and local-calendar/payment-complete reports. Component-level deal inventory and native unattended printing remain outside the existing data/runtime capabilities and are explicitly documented rather than implied by the UI.
