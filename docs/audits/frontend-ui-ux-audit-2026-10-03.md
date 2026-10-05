# Frontend UI and UX Audit

Date: 2026-10-03

## Scope

This audit covers the mounted POS experience:

- Login and password recovery entry points
- Desktop and mobile navigation
- Order line, category browser, cart, checkout, receipt preview, and customer display
- Dishes and deals management, including the new-dish form
- Daily sales, profit and loss, and settings
- Shared layout, color, spacing, animation, dialog, and keyboard interaction patterns

The repository also contains `CustomersView`, `StaffManagementView`, `ManageTableView`, and `HelpCenterView`, but they are not mounted by `App.tsx` or reachable through the current navigation. They were not treated as production UI flows.

## Method

- Ran the local POS application and walked through the mounted admin and checkout flows without placing an order or making persistent settings changes.
- Reviewed the rendered login, order line, mobile navigation, checkout drawer, receipt preview, management, sales, profit and loss, settings, customer display, and new-dish modal.
- Inspected component and stylesheet source for responsive behavior, accessibility, print output, focus management, and interaction gaps.
- Verified `npm run lint` and `npm run build` both pass.

## Summary

The visual baseline is polished and generally consistent: the order cards, management screens, reporting surfaces, and customer display share a recognizable POS style. The key problems are operational rather than cosmetic. Printing is broken by the print stylesheet, mobile checkout cannot be dismissed, cart lines cannot be corrected, and kitchen notes are silently lost. These should be fixed before further visual refinements.

## Findings

### F-01: Print actions can produce blank output

Severity: Critical

Evidence:

- `src/index.css:45-60` hides every `body` element when printing and only reveals `#thermal-receipt-print-area`.
- No component renders an element with that ID.
- `src/components/ThermalReceiptModal.tsx:33-35` and `src/components/ProfitLossView.tsx:192` call `window.print()`.

Impact: Cashiers can complete a sale but receive an empty receipt or report printout.

Recommendation: Wrap the intended receipt and report content in explicit printable regions, give each a print-specific layout, and test both the receipt modal and P&L report with the browser print preview.

### F-02: Mobile checkout has no safe dismissal path

Severity: Critical

Evidence:

- `src/App.tsx:568-569` passes `onCloseMobile` into `CartDrawer`.
- `src/components/CartDrawer.tsx:197-203` renders the mobile drawer but never invokes that callback.
- The live checkout drawer contains no close button, backdrop dismissal, or Escape behavior.

Impact: A cashier who opens checkout must clear or complete the order to return to the menu, which is disruptive during a live transaction.

Recommendation: Add a labeled close button, backdrop click handling, Escape dismissal, and focus return to the cart trigger.

### F-03: Cart lines cannot be edited or removed

Severity: Critical

Evidence:

- `src/App.tsx:561-562` passes cart quantity and remove handlers.
- `src/components/CartDrawer.tsx:25-26` intentionally renames those handlers as unused values.
- The live drawer only exposes Clear Order, not per-line quantity or removal controls.

Impact: A mistaken item requires clearing the complete cart and rebuilding the transaction.

Recommendation: Add inline decrement, increment, and remove controls for every line item, including a confirmation only for clearing the entire cart.

### F-04: Kitchen instructions are silently discarded

Severity: High

Evidence:

- `src/components/VariationModal.tsx:105` passes `notes` with the selected variations.
- `src/App.tsx:238-258` accepts only product, variations, and quantity, then creates a cart item without `notes`.

Impact: The UI invites instructions such as "less salt" but neither the kitchen slip nor saved order receives them.

Recommendation: Accept the fourth callback argument, persist it in the cart item, surface it in checkout, and confirm it appears on the kitchen slip.

### F-05: Core clickable cards are not keyboard accessible

Severity: High

Evidence:

- `src/components/OrderLineView.tsx:161-174` uses a clickable `div` for each product card.
- `src/components/ManageDishesView.tsx:446-484`, `574-688`, and `697-731` use clickable `div`s for category and product management cards.

Impact: Keyboard and assistive-technology users cannot operate key POS actions reliably. Hover-only management actions also disappear for keyboard and touch users.

Recommendation: Use semantic buttons for card actions, provide accessible names, preserve visible focus states, and expose edit/delete actions through a keyboard-accessible menu.

### F-06: Dialogs and drawers lack modal accessibility behavior

Severity: High

Evidence:

- Variation, receipt, cart, and management overlays are visual containers without `role="dialog"`, `aria-modal`, a focus trap, focus restoration, or an Escape handler.
- Representative locations: `src/components/VariationModal.tsx:110`, `src/components/ThermalReceiptModal.tsx:143`, `src/components/CartDrawer.tsx:197`, and `src/components/ManageDishesView.tsx:740`.

Impact: Keyboard focus can reach obscured content, screen-reader context is unclear, and accidental interactions become more likely.

Recommendation: Introduce one reusable accessible dialog/drawer primitive and use it across all overlays.

### F-07: Staff PIN is visible as ordinary text

Severity: High

Evidence:

- `src/components/SettingsView.tsx:360-367` renders the cashier access PIN with `type="text"`.

Impact: Anyone near the management screen can read a credential from the display.

Recommendation: Use `type="password"`, an explicit reveal affordance, and avoid pre-populating credentials where possible.

### F-08: Navigation width changes and hover overlays can occlude work

Severity: Medium

Evidence:

- `src/components/Sidebar.tsx:74-85` reserves 76px but expands an absolute, z-indexed 240px panel on hover.
- It also reserves 240px only on the dishes page, causing horizontal layout movement when navigating.

Impact: The sidebar can cover content on hover and the main work area visibly shifts between pages.

Recommendation: Keep one stable navigation width, or reserve expansion space consistently. Do not rely on an overlay for primary navigation.

### F-09: Fixed mobile checkout CTA can hide final menu cards

Severity: Medium

Evidence:

- `src/components/OrderLineView.tsx:81` defines the scroll area without a CTA-sized bottom inset.
- `src/components/OrderLineView.tsx:251-265` places checkout in a fixed bottom position.

Impact: The last row can be partially obscured while an order is in progress.

Recommendation: Add responsive bottom padding equal to the CTA height plus safe-area inset.

### F-10: Secondary text does not meet accessible contrast targets

Severity: Medium

Evidence:

- `text-slate-400` is repeatedly used at 10-11px against white and near-white surfaces, for example in `src/components/SettingsView.tsx:120`, `src/components/DashboardView.tsx:215`, and `src/components/CartDrawer.tsx:57`.
- Tailwind slate-400 (`#94A3B8`) is approximately 2.6:1 against white, below the 4.5:1 target for normal text.

Impact: Operational labels, helper text, totals context, and settings descriptions are difficult to read under restaurant lighting.

Recommendation: Establish a darker secondary-text token, use at least 12px for operational content, and validate the design tokens against WCAG AA.

### F-11: Declared drawer and modal animations are not compiled

Severity: Medium

Evidence:

- Components use `animate-in`, `fade-in`, `slide-in-from-left`, and related utilities; examples include `src/components/Sidebar.tsx:202-203` and `src/components/CartDrawer.tsx:198-200`.
- The built CSS contains no selectors for those utilities, so the animation declarations do not take effect.

Impact: Intended entry/exit feedback is absent and interaction state changes feel abrupt.

Recommendation: Add a compatible animation utility/plugin or define the required keyframes and utility classes locally. Keep motion brief and respect reduced-motion preferences.

### F-12: Customer display is constrained to a single desktop layout

Severity: Medium

Evidence:

- `src/components/CustomerDisplayWindow.tsx:102-104` always renders a two-column layout with 32px padding and gap.
- `src/components/CustomerDisplayWindow.tsx:171` reserves a 384-420px live-bill panel.

Impact: Smaller secondary monitors can compress or clip the customer-facing bill.

Recommendation: Add breakpoints that stack or simplify the promo region, reduce outer padding, and test common 1024x768 and portrait display resolutions.

### F-13: New-dish modal has unused visual space

Severity: Low

Evidence:

- The rendered new-dish dialog leaves a large empty right-side region until an option is added.
- The dialog is defined at `src/components/ManageDishesView.tsx:740`.

Impact: The form feels incomplete and requires more scanning than necessary.

Recommendation: Use a single-column form until variations exist, then expand to a two-column layout.

### F-14: Admin pages do not have URL-backed navigation

Severity: Low

Evidence:

- `src/App.tsx:47` initializes `activeTab` in local React state.
- `src/App.tsx:546-615` conditionally mounts all pages from that state without URL synchronization.

Impact: Refresh, browser back/forward, bookmarked report views, and operational handoff always lose the current page.

Recommendation: Introduce a router or synchronize the active section to the URL.

### F-15: Print Test Slip is a silent no-op when the cart is empty

Severity: Low

Evidence:

- `src/components/SettingsView.tsx:182-187` exposes Print Test Slip.
- `src/App.tsx:359-362` exits immediately when the cart is empty.

Impact: Hardware testing appears available but gives no feedback until a cart is created.

Recommendation: Generate a dedicated sample receipt, or disable the action with an explanatory message.

## Recommended Fix Order

1. Repair print output, checkout dismissal, cart-line editing, and instruction persistence.
2. Standardize accessible dialogs, keyboard semantics, and focus behavior.
3. Protect the staff PIN and correct secondary-text contrast.
4. Stabilize navigation width, fixed CTA spacing, and customer-display responsiveness.
5. Restore intended motion, reduce modal whitespace, and add URL-backed navigation.

## Acceptance Checks For Follow-up Work

- Browser print preview shows a populated 80mm and 58mm receipt, plus a visible P&L report.
- A cashier can close checkout, correct one line item, remove one line item, and retain the rest of the cart.
- A variation note appears in the cart, persisted order, customer receipt where appropriate, and kitchen slip.
- All card, drawer, modal, and menu workflows are operable by keyboard with visible focus and Escape dismissal.
- Mobile order-line content remains reachable above the checkout CTA.
- Key text and controls meet WCAG AA contrast requirements.
