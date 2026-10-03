# Frontend UI and UX Remediation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the POS safe to use during live transactions by repairing printing, checkout recovery, cart correction, instruction persistence, accessibility, and responsive behavior.

**Architecture:** Preserve the existing React state model and Express API. Add a small testing foundation, extract only reusable interaction primitives, and keep the remediation at the responsible UI layer: checkout behavior remains in `App` and `CartDrawer`, dialogs share one accessible primitive, and print behavior remains scoped to the active report or receipt. Use the native History API rather than introducing a router dependency for five internal sections.

**Tech Stack:** React 19, TypeScript, Vite 8, Tailwind CSS 4, lucide-react, Vitest, React Testing Library, jsdom.

**Spec:** `docs/audits/frontend-ui-ux-audit-2026-10-03.md`

## Global Constraints

- Preserve existing POS data, order creation, SQLite schema, and API contracts.
- Do not modify `maltiva_pos.db`, `maltiva_pos.db-wal`, or `maltiva_pos.db-shm` while implementing UI fixes.
- Do not alter unrelated existing worktree changes.
- Use semantic HTML, Lucide icons, keyboard-visible focus states, and `prefers-reduced-motion` support.
- Keep the current teal as the primary action color; use no more than one semantic accent color per page section.
- Use compact operational surfaces: 8px or smaller card radii for newly modified card-like controls.
- New runtime dependencies are limited to the test stack; do not add a client-side router.
- Every behavior change requires a focused automated test plus `npm run lint` and `npm run build` verification.

## Review Focus

- Empty cart: Print Test Slip must show a sample receipt instead of silently doing nothing. Test in Task 8.
- Incorrect cart line: decrementing one item to zero removes only that line and preserves every other line. Test in Task 3.
- Required variation and kitchen note: a selected variation and note must persist through cart, order payload, and kitchen receipt text. Test in Task 3.
- Keyboard overlay interaction: opening a drawer or modal moves focus inside; Escape closes it and restores focus to the trigger. Test in Task 4.
- Small display layout: at 1024x768 and a narrow mobile viewport, no action is clipped by fixed navigation, checkout CTA, or the customer display bill. Test in Tasks 6 and 8.

---

## File Structure

| Path | Responsibility |
| --- | --- |
| `package.json` | Add focused test scripts and test-only dependencies. |
| `vite.config.ts` | Configure Vitest with jsdom and the project setup file. |
| `src/test/setup.ts` | Register DOM matchers and clean up React renders. |
| `src/components/ui/Modal.tsx` | Shared accessible modal behavior: dialog semantics, focus trap, Escape, and focus restoration. |
| `src/components/ui/SideDrawer.tsx` | Shared accessible right/left drawer behavior and dismissal. |
| `src/components/CartDrawer.tsx` | Editable cart lines, accessible mobile checkout drawer, and safe exit behavior. |
| `src/components/VariationModal.tsx` | Persist notes and consume the shared modal primitive. |
| `src/components/ThermalReceiptModal.tsx` | Print-target markup and accessible receipt dialog. |
| `src/components/OrderLineView.tsx` | Semantic product cards and reserved space for the mobile checkout CTA. |
| `src/components/ManageDishesView.tsx` | Semantic management cards, keyboard-accessible actions, and compact empty modal layout. |
| `src/components/Sidebar.tsx` | Stable-width navigation and accessible mobile drawer. |
| `src/components/CustomerDisplayWindow.tsx` | Breakpoint-safe customer-display layout. |
| `src/components/SettingsView.tsx` | Protected PIN input and functional test print entry point. |
| `src/components/DashboardView.tsx` | Semantic report print target. |
| `src/components/ProfitLossView.tsx` | Semantic report print target. |
| `src/App.tsx` | Cart-note persistence, test receipt generation, and URL-backed active section state. |
| `src/index.css` | Design tokens, compiled motion utilities, print visibility rules, responsive insets, and reduced-motion styles. |
| `tests/**/*.test.tsx` | Focused interaction, print, keyboard, and responsive regression tests. |

## Task 1: Establish a UI Test Foundation

**Files:**
- Modify: `package.json`
- Modify: `vite.config.ts`
- Create: `src/test/setup.ts`
- Create: `tests/app-smoke.test.tsx`

**Interfaces:**
- Produces: `npm run test` for a single non-watch Vitest run.
- Produces: `renderApp()` test helper local to test files until duplication justifies extraction.

- [ ] **Step 1: Add failing smoke coverage for the login screen**

Create `tests/app-smoke.test.tsx` with a test named `renders the terminal login when no session exists`. Mock `PosStorage.getSession` to return `null`, render `App`, and assert the Terminal Login heading and Sign In to Terminal button are visible.

- [ ] **Step 2: Run the smoke test to verify the test command is unavailable**

Run: `npm run test -- tests/app-smoke.test.tsx`

Expected: FAIL because the project does not yet define a test script.

- [ ] **Step 3: Configure Vitest and DOM matchers**

Add `vitest`, `jsdom`, `@testing-library/react`, `@testing-library/user-event`, and `@testing-library/jest-dom` as development dependencies. Add `test` and `test:watch` scripts, configure `test.environment = 'jsdom'` and `test.setupFiles = './src/test/setup.ts'` in `vite.config.ts`, and create `src/test/setup.ts` to import jest-dom and clean up after each test.

- [ ] **Step 4: Run the smoke test and type check**

Run: `npm run test -- tests/app-smoke.test.tsx && npm run lint`

Expected: PASS with one smoke test and no TypeScript errors.

- [ ] **Step 5: Commit the test foundation**

```bash
git add package.json package-lock.json vite.config.ts src/test/setup.ts tests/app-smoke.test.tsx
git commit -m "test: add React UI test foundation"
```

## Task 2: Repair Receipt and Report Printing

**Files:**
- Modify: `src/components/ThermalReceiptModal.tsx:142-445`
- Modify: `src/components/DashboardView.tsx:288-370`
- Modify: `src/components/ProfitLossView.tsx:172-405`
- Modify: `src/index.css:43-66`
- Create: `tests/print-output.test.tsx`

**Interfaces:**
- Consumes: `Order`, `PrinterSettings`, and the existing `window.print()` behavior.
- Produces: `#thermal-receipt-print-area` and `#profit-loss-print-area` as explicit printable regions.

- [ ] **Step 1: Write failing print-region tests**

Create tests named `renders the receipt in thermal-receipt-print-area` and `renders the P&L summary in profit-loss-print-area`. Render the receipt with one order item and render `ProfitLossView` with one completed order. Assert that each target exists and contains the expected order or revenue content.

- [ ] **Step 2: Run the print-region tests to verify they fail**

Run: `npm run test -- tests/print-output.test.tsx`

Expected: FAIL because no print-target IDs are rendered.

- [ ] **Step 3: Add print-target markup and scoped print CSS**

Wrap only the receipt slips in `#thermal-receipt-print-area`; wrap only the P&L report in `#profit-loss-print-area`. Replace the global print rule with selectors that make the active target visible without hiding its own descendants. Preserve 80mm and 58mm receipt widths, and add an A4 report print layout for P&L.

- [ ] **Step 4: Run automated and browser print verification**

Run: `npm run test -- tests/print-output.test.tsx && npm run build`

Expected: PASS. Then open browser print preview for an 80mm receipt, a 58mm receipt, and a P&L report; each preview contains visible content and no application chrome.

- [ ] **Step 5: Commit the print fix**

```bash
git add src/components/ThermalReceiptModal.tsx src/components/DashboardView.tsx src/components/ProfitLossView.tsx src/index.css tests/print-output.test.tsx
git commit -m "fix: render printable receipts and reports"
```

## Task 3: Make Checkout Correctable and Preserve Kitchen Notes

**Files:**
- Modify: `src/App.tsx:238-285, 300-405`
- Modify: `src/components/CartDrawer.tsx:21-205`
- Modify: `src/components/VariationModal.tsx:6-247`
- Modify: `src/components/ThermalReceiptModal.tsx:59-130, 270-408`
- Create: `tests/checkout-flow.test.tsx`

**Interfaces:**
- Changes: `handleAddVariationToCart(product: Product, selectedVariations: SelectedVariationItem[], quantity: number, notes: string): void`.
- Consumes: Existing `CartItem.notes?: string` and `OrderItem.notes?: string` types.
- Produces: Per-line `onUpdateQuantity(cartItemId, delta)` and `onRemoveItem(cartItemId)` controls in `CartDrawer`.

- [ ] **Step 1: Write failing transaction-regression tests**

Add tests named `edits one cart line without clearing another`, `removes a cart line at quantity zero`, and `persists a variation note to the order and kitchen receipt`. Use two cart lines in the first two tests. In the notes test, enter `No onions`, add the configured product, invoke order construction through the visible checkout flow, and assert the kitchen slip includes `SPECIAL: No onions`.

- [ ] **Step 2: Run checkout regression tests to verify they fail**

Run: `npm run test -- tests/checkout-flow.test.tsx`

Expected: FAIL because no per-line controls are rendered and `notes` is discarded.

- [ ] **Step 3: Implement line controls and note propagation**

Render icon-only decrement, increment, and remove buttons per cart line with `aria-label` values that include the product name. Keep the existing Clear Order action as a separate destructive action. Pass notes from `VariationModal` to `handleAddVariationToCart`, store them on `CartItem`, and copy notes into both temporary receipt previews and submitted order items.

- [ ] **Step 4: Run checkout tests and inspect the live cart**

Run: `npm run test -- tests/checkout-flow.test.tsx && npm run lint`

Expected: PASS. In the local POS, add two dishes, adjust one, remove one, and confirm the remaining line and total stay correct.

- [ ] **Step 5: Commit checkout corrections**

```bash
git add src/App.tsx src/components/CartDrawer.tsx src/components/VariationModal.tsx src/components/ThermalReceiptModal.tsx tests/checkout-flow.test.tsx
git commit -m "fix: support cart corrections and kitchen notes"
```

## Task 4: Introduce Accessible Modal and Drawer Primitives

**Files:**
- Create: `src/components/ui/Modal.tsx`
- Create: `src/components/ui/SideDrawer.tsx`
- Modify: `src/components/VariationModal.tsx`
- Modify: `src/components/ThermalReceiptModal.tsx`
- Modify: `src/components/CartDrawer.tsx`
- Modify: `src/components/Sidebar.tsx`
- Modify: `src/components/ManageDishesView.tsx`
- Create: `tests/overlay-accessibility.test.tsx`

**Interfaces:**
- Produces: `Modal({ titleId, onClose, children, footer? })` with `role="dialog"`, `aria-modal="true"`, Escape dismissal, tab containment, and trigger focus restoration.
- Produces: `SideDrawer({ side: 'left' | 'right', title, onClose, children })` with the same keyboard behavior.

- [ ] **Step 1: Write failing overlay-accessibility tests**

Create tests named `traps focus and restores the product trigger after closing a variation modal` and `closes the checkout drawer with Escape`. Assert `role="dialog"`, focus movement on open, Escape dismissal, and focus restoration.

- [ ] **Step 2: Run overlay tests to verify they fail**

Run: `npm run test -- tests/overlay-accessibility.test.tsx`

Expected: FAIL because current overlays are plain containers without dialog semantics or keyboard handling.

- [ ] **Step 3: Implement the reusable primitives and migrate overlays**

Implement focus handling without a new runtime package. Migrate variation, receipt, cart drawer, mobile navigation, and every `ManageDishesView` modal. Give each overlay a visible close button with an accessible name; only close on a backdrop click when the click originates on the backdrop itself.

- [ ] **Step 4: Run overlay tests and manually traverse dialogs by keyboard**

Run: `npm run test -- tests/overlay-accessibility.test.tsx`

Expected: PASS. Manually verify Tab, Shift+Tab, Enter, and Escape in the receipt, new-dish, category, stock, and delete dialogs.

- [ ] **Step 5: Commit accessible overlays**

```bash
git add src/components/ui/Modal.tsx src/components/ui/SideDrawer.tsx src/components/VariationModal.tsx src/components/ThermalReceiptModal.tsx src/components/CartDrawer.tsx src/components/Sidebar.tsx src/components/ManageDishesView.tsx tests/overlay-accessibility.test.tsx
git commit -m "feat: add accessible modal and drawer behavior"
```

## Task 5: Make Product and Management Cards Semantic

**Files:**
- Modify: `src/components/OrderLineView.tsx:154-267`
- Modify: `src/components/ManageDishesView.tsx:446-731`
- Create: `tests/card-controls.test.tsx`

**Interfaces:**
- Produces: Button-based product selection and category/product management actions with explicit accessible names.
- Preserves: Existing click behavior, quantity controls, grid/list view, edit, stock adjustment, and deletion workflows.

- [ ] **Step 1: Write failing keyboard-operation tests**

Create tests named `adds a product with Enter from the order card`, `opens dish editing from a keyboard-accessible management card`, and `exposes category edit and delete actions without hover`. Assert keyboard activation and named controls.

- [ ] **Step 2: Run card-control tests to verify they fail**

Run: `npm run test -- tests/card-controls.test.tsx`

Expected: FAIL because the relevant cards are clickable `div` elements and category actions only appear on hover.

- [ ] **Step 3: Replace non-semantic interactive cards with buttons**

Use button elements for the whole-card primary action. Prevent nested-button violations by keeping quantity and overflow actions outside the card button or by using separate sibling controls. Give icon-only controls `aria-label` values, retain image alt text, and render category actions in an always-discoverable overflow menu.

- [ ] **Step 4: Run keyboard tests and inspect focus styles**

Run: `npm run test -- tests/card-controls.test.tsx && npm run lint`

Expected: PASS. In the browser, every card action shows a visible focus ring and works with Enter and Space.

- [ ] **Step 5: Commit semantic card controls**

```bash
git add src/components/OrderLineView.tsx src/components/ManageDishesView.tsx tests/card-controls.test.tsx
git commit -m "fix: make POS cards keyboard accessible"
```

## Task 6: Stabilize Navigation, Motion, and Mobile Order-Line Spacing

**Files:**
- Modify: `src/components/Sidebar.tsx:68-278`
- Modify: `src/components/OrderLineView.tsx:80-267`
- Modify: `src/index.css:1-66`
- Create: `tests/navigation-layout.test.tsx`

**Interfaces:**
- Produces: A stable desktop sidebar width chosen once for the session and a non-occluding mobile drawer.
- Produces: Local `fade-in`, `slide-in-from-left`, `slide-in-from-right`, and `zoom-in-95` keyframes with reduced-motion fallbacks.

- [ ] **Step 1: Write failing layout tests**

Create tests named `keeps the desktop navigation width stable when switching sections`, `adds mobile checkout clearance to the order grid`, and `provides reduced-motion overrides for overlay animation classes`.

- [ ] **Step 2: Run layout tests to verify they fail**

Run: `npm run test -- tests/navigation-layout.test.tsx`

Expected: FAIL because hover expansion overlays content, the CTA has no scroll inset, and no compiled animation utilities exist.

- [ ] **Step 3: Implement stable layout and authored motion utilities**

Use one reserved desktop sidebar width; expose compact/expanded state through an explicit pin control rather than hover-only overlay expansion. Add order-line bottom padding that accounts for the fixed CTA and `env(safe-area-inset-bottom)`. Define the motion keyframes in `src/index.css` and disable nonessential motion in `@media (prefers-reduced-motion: reduce)`.

- [ ] **Step 4: Run layout tests and verify desktop/mobile screenshots**

Run: `npm run test -- tests/navigation-layout.test.tsx && npm run build`

Expected: PASS. Capture browser screenshots at desktop, tablet, and mobile widths; no content may be covered by navigation or checkout controls.

- [ ] **Step 5: Commit layout stabilization**

```bash
git add src/components/Sidebar.tsx src/components/OrderLineView.tsx src/index.css tests/navigation-layout.test.tsx
git commit -m "fix: stabilize navigation and mobile checkout layout"
```

## Task 7: Apply an Accessible Operational Visual System

**Files:**
- Modify: `src/index.css`
- Modify: `src/components/LoginScreen.tsx`
- Modify: `src/components/CartDrawer.tsx`
- Modify: `src/components/DashboardView.tsx`
- Modify: `src/components/ProfitLossView.tsx`
- Modify: `src/components/SettingsView.tsx`
- Modify: `src/components/ManageDishesView.tsx`
- Create: `tests/visual-token-contract.test.tsx`

**Interfaces:**
- Produces: Named CSS custom properties for primary action, dark secondary text, muted text, panel border, panel background, and focus ring.
- Preserves: Teal primary actions and intentional semantic colors for warnings and destructive actions.

- [ ] **Step 1: Write failing token-contract tests**

Create tests named `uses the approved muted text token for operational helper copy` and `uses compact radius classes for modified operational cards`. Assert class contracts in representative checkout, dashboard, settings, and management elements.

- [ ] **Step 2: Run visual-token tests to verify they fail**

Run: `npm run test -- tests/visual-token-contract.test.tsx`

Expected: FAIL because small helper text currently uses `text-slate-400` and large `rounded-3xl` cards dominate operational screens.

- [ ] **Step 3: Define and apply the visual tokens**

Add CSS variables with a dark enough muted-text color to meet 4.5:1 against white. Replace `text-slate-400` only in operational content and preserve intentionally de-emphasized decorative content. Reduce modified cards and controls to 8px radii, tighten vertical spacing where the new-dish modal has no variation rows, and retain readable touch targets.

- [ ] **Step 4: Run token tests and perform a contrast check**

Run: `npm run test -- tests/visual-token-contract.test.tsx && npm run lint`

Expected: PASS. Check the final muted token against white and `#F8FAFA`; normal-size text must meet WCAG AA.

- [ ] **Step 5: Commit visual-system corrections**

```bash
git add src/index.css src/components/LoginScreen.tsx src/components/CartDrawer.tsx src/components/DashboardView.tsx src/components/ProfitLossView.tsx src/components/SettingsView.tsx src/components/ManageDishesView.tsx tests/visual-token-contract.test.tsx
git commit -m "fix: improve operational contrast and spacing"
```

## Task 8: Secure Settings and Make Secondary-Screen Workflows Responsive

**Files:**
- Modify: `src/App.tsx:359-405`
- Modify: `src/components/SettingsView.tsx:38-62, 170-259, 347-378`
- Modify: `src/components/CustomerDisplayWindow.tsx:82-270`
- Create: `tests/settings-and-display.test.tsx`

**Interfaces:**
- Produces: `createTestReceipt(currentUser: User, settings: PrinterSettings): Order` in `App.tsx` or a colocated pure helper.
- Produces: A password input with an explicit show/hide control for the cashier PIN.

- [ ] **Step 1: Write failing settings and display tests**

Create tests named `opens a sample receipt from Print Test Slip with an empty cart`, `masks the cashier PIN until the reveal control is selected`, and `uses stacked customer display layout below the compact-display breakpoint`.

- [ ] **Step 2: Run settings/display tests to verify they fail**

Run: `npm run test -- tests/settings-and-display.test.tsx`

Expected: FAIL because test print returns early, PIN uses a text input, and the customer display has no compact layout.

- [ ] **Step 3: Implement a sample receipt, protected PIN, and display breakpoints**

Generate a deterministic sample receipt without persisting an order. Replace the PIN field with `type="password"` and a labeled reveal button. Add customer-display breakpoints that reduce padding and stack promotional content above the bill panel at small widths, while preserving the optimized 1024x768 two-column display.

- [ ] **Step 4: Run settings/display tests and inspect both display sizes**

Run: `npm run test -- tests/settings-and-display.test.tsx && npm run build`

Expected: PASS. Inspect the customer display at 1024x768 and a narrow viewport; the bill, total, and token remain visible without horizontal clipping.

- [ ] **Step 5: Commit settings and display fixes**

```bash
git add src/App.tsx src/components/SettingsView.tsx src/components/CustomerDisplayWindow.tsx tests/settings-and-display.test.tsx
git commit -m "fix: secure settings and responsive customer display"
```

## Task 9: Preserve Admin Location Through URL Navigation

**Files:**
- Modify: `src/App.tsx:30-48, 509-615`
- Modify: `src/components/Sidebar.tsx`
- Create: `tests/section-navigation.test.tsx`

**Interfaces:**
- Produces: `tabFromPathname(pathname: string): NavTab` and `pathnameForTab(tab: NavTab): string` in `App.tsx` or a colocated navigation helper.
- Preserves: `/customer-display` as a separate display-only route and cashier access limited to `/order-line`.

- [ ] **Step 1: Write failing URL-navigation tests**

Create tests named `renders profit and loss from its pathname`, `updates the pathname when sidebar navigation changes`, and `returns to the previous section on popstate`.

- [ ] **Step 2: Run navigation tests to verify they fail**

Run: `npm run test -- tests/section-navigation.test.tsx`

Expected: FAIL because `activeTab` always initializes to `order_line` and sidebar clicks do not update browser history.

- [ ] **Step 3: Synchronize active tab with the native History API**

Map the five supported sections to stable pathnames. Initialize from `window.location.pathname`, call `history.pushState` after a user-initiated section change, and listen for `popstate`. Keep unknown paths and unauthorized cashier paths on Order Line without exposing protected pages.

- [ ] **Step 4: Run navigation tests and verify refresh/back behavior**

Run: `npm run test -- tests/section-navigation.test.tsx && npm run lint`

Expected: PASS. In the browser, reload a report path and use back/forward through at least three admin sections.

- [ ] **Step 5: Commit URL-backed section navigation**

```bash
git add src/App.tsx src/components/Sidebar.tsx tests/section-navigation.test.tsx
git commit -m "feat: preserve POS section navigation in URLs"
```

## Task 10: Final Regression and Delivery Review

**Files:**
- Modify: `docs/audits/frontend-ui-ux-audit-2026-10-03.md`
- Create: `docs/audits/frontend-ui-ux-verification-2026-10-03.md`

**Interfaces:**
- Consumes: All prior test suites and audit acceptance checks.
- Produces: A verification record mapping every audit finding to a test, manual validation, or explicitly deferred item.

- [ ] **Step 1: Run the complete automated suite**

Run: `npm run test && npm run lint && npm run build`

Expected: All tests pass, TypeScript emits no errors, and Vite completes a production build.

- [ ] **Step 2: Perform the manual operational walkthrough**

At desktop, tablet, and mobile widths, verify login, category selection, product addition, variation notes, cart correction, checkout dismissal, receipt preview, 80mm and 58mm print previews, report print preview, management dialogs, customer display, sidebar navigation, browser back/forward, and reduced-motion behavior.

- [ ] **Step 3: Record the verification result**

Create `docs/audits/frontend-ui-ux-verification-2026-10-03.md` with each audit ID, its automated/manual proof, screenshot references where useful, and any explicitly deferred work. Update the original audit only to mark findings resolved or deferred; do not delete historical evidence.

- [ ] **Step 4: Request a focused code review**

Review focus: print selectors, cart math, note propagation, keyboard focus restoration, and role-gated URL navigation.

- [ ] **Step 5: Commit final verification documentation**

```bash
git add docs/audits/frontend-ui-ux-audit-2026-10-03.md docs/audits/frontend-ui-ux-verification-2026-10-03.md
git commit -m "docs: verify frontend UX remediation"
```

## Self-Review

- Spec coverage: Every finding F-01 through F-15 is covered by Tasks 2 through 9. Task 10 records proof for every result.
- Step clarity: Every implementation task names exact files, interfaces, tests, expected failures, expected passing commands, and a scoped commit.
- Type consistency: The plan uses the existing `CartItem.notes` and `OrderItem.notes` fields and changes only the `handleAddVariationToCart` callback to accept the already-declared notes argument.
- Review focus: Empty-cart printing belongs to Task 8; cart removal and note propagation belong to Task 3; overlay keyboard behavior belongs to Task 4; compact viewports belong to Tasks 6 and 8.
- Proportion: The plan avoids unrelated refactors, does not introduce a runtime router, and keeps new dependencies limited to testing.

## Execution Handoff

Plan complete and saved to `docs/plans/2026-10-03-frontend-ui-ux-remediation.md`. Please review the plan. Which execution approach would you prefer?

- **Subagent-driven** - A fresh subagent implements each task and a fresh reviewer checks it before the next one starts, then a whole-branch review at the end. Most thorough; costs a fresh context per task and per review.
- **Native** - I implement every task myself in this session, then one focused reviewer checks the completed work. Faster and less expensive, with less independent review during the sequence.

For this plan I recommend **Subagent-driven**, because print output, transaction correctness, keyboard behavior, and navigation changes are coupled but independently testable; a regression in any one could disrupt live cashier workflows. Does the plan capture what you want, and which approach should we use?
