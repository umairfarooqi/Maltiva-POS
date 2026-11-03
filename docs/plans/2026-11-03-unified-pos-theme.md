# Unified Maltiva POS theme

Roll out the approved charcoal and amber cashier look across the POS. Preserve the large menu photos, visible cart, and existing transaction flows. This document is the implementation and acceptance plan.

## One source of truth

Edit [pos-theme.css](../../public/pos-theme.css) to change the shipped palette. For a new primary color, update `--pos-action`, its hover and pressed colors, and `--pos-action-text` in the relevant mode. The app stylesheet exposes these values to Tailwind and the owner setup window reads the same file.

- Put the palette in one shared CSS file under `public/` so the web app can load it before first paint and Electron can package the same source for its local first-run window. Keep Tailwind's existing `--color-pos-*` aliases in the app stylesheet and point them at the shared semantic variables. Use CSS custom properties and data attributes, with no UI framework migration.
- Define dark, light, and print palettes centrally. Use the approved dark reference values `#1A1A1A`, `#1C1C1C`, `#262626`, `#ABABAB`, `#F5F5F5`, and `#F6B100`. Give amber actions a dark foreground. Use the reference blue, green, and red for information, success, and danger, adjusting text shades where contrast requires it. Carry the existing warm light direction across the app with dark text and a contrast-checked accent.
- Define pairs for canvas and text, chrome and navigation, surface and panel text, raised, inset, border, control border, divider, focus ring and offset, primary and hover/pressed foregrounds, secondary, outline, ghost, selected, disabled, overlay, and status background/text/border. Keep warning distinct from ordinary selection through labels and icons as well as color. Include reserved/table status and chart series where used.
- Define shared scales for spacing, radii, type and line height, touch targets, control heights, elevation, transitions, stacking, and responsive density. Keep existing CSS utilities where they map cleanly. Introduce small shared style recipes only where repeated controls diverge.
- Remove the cashier-only override, separate login palette, duplicated inline startup colors, and hard-coded component colors after migration. Allow explicit exceptions for the brand artwork, food photos, user-provided images, print requirements, and Windows-native dialogs. Treat the installer icon and favicon as branded assets.
- Retain the saved `maltiva-theme` value and dark fallback. Apply it before first paint, synchronize same-origin windows, and verify blocked storage. Use the shared palette for Electron setup through its packaged stylesheet and local CSP. First run defaults to dark. Apply an existing preference there only if it can be read through a narrowly scoped mechanism. Browser chrome should follow `color-scheme`.

## Screen coverage

| Surface | Coverage |
| --- | --- |
| Shell and authentication | Startup canvas, session loading, signed-out and expired states, login PIN/password, profile selection, offline and error messages, Electron owner setup, desktop sidebar, collapsed rail, mobile navigation, header, account menu and logout. |
| Cashier | Search and clear, category chips and counts, scroll arrows, menu and deal cards, image loading and fallback, missing menu, selected and sold-out items, stock badges, add/choose and quantity controls, mobile checkout, pinned cart, empty and populated orders. |
| Checkout and recovery | Cash, Card and Scan, cash keypad and quick amounts, invalid and insufficient tender, exact cash, change due, processing lock, success, pending, retry, rejection, rejected-sale review, recovery conflicts, receipt preview, print actions, and confirmation dialogs. |
| Product configuration | Sizes, single and multiple selection, required options, add-ons, notes, quantity limits, pricing changes, sticky total/action footer, edit from cart, and disabled or unavailable options. |
| Receipts | Draft and applied filters, date controls, clear button, reference/token lookup, loading, empty results, failed search, retry, pagination, detail and reprint. |
| Management and reporting | Menu and deal management, product/category editor, stock adjustments, tables and reservation statuses, customers, staff and PIN management, Help, Daily Sales and Profit & Loss. Cover tables, totals, summaries, charts if present, filters, pagination, exports, and role restrictions. Include existing components that are currently dormant so they can be re-enabled without a second theme. |
| Settings and maintenance | Theme switch, store and device settings, form validation and saves, read-only manager state, backup listing/download, server folder, menu template, restore preview and confirmation, cache actions, and independently scrolling content with footer. |
| Secondary and print | Customer display idle, populated and confirmation states, separate monitor and disconnect/reconnect, receipt screen preview, 58 mm and 80 mm customer/kitchen slips, and report printing. Use a shared white-paper/black-ink print palette. Check native Electron error dialogs for legibility under Windows settings. |

## Variants, states, and sizing

| Family | Required variants and states |
| --- | --- |
| Buttons and icon controls | Primary, secondary, outline, ghost, destructive, icon-only, link, segmented, and toggle. Default, hover, focus-visible, active, selected/pressed, disabled, loading and success feedback. Keep accessible names on icon-only controls. |
| Inputs and forms | Text, search, password, PIN, number/currency, native date, select, textarea, file picker, checkbox, radio and switch. Empty, populated, placeholder, focused, invalid, required, read-only, disabled and autofill. Include validation messages and long values. |
| Cards, lists and tables | Product, deal, summary, stock, cart, receipt, staff and settings cards. Normal, selected, hover, sold out, loading, missing image, empty, error, stale and overflow states. Cover table header, sortable indicators where present, row hover, pagination boundaries and horizontal overflow. |
| Overlays and feedback | Dialog, alert dialog, drawer, keypad, menus and tooltips where present. Backdrop, focus trap, initial and restored focus, scroll lock, keyboard dismissal where allowed, busy lock, success/info/warning/danger, retry and offline. Keep underlying semantic labels and announcements. |
| Control sizes | Compact, default touch, large checkout, and square icon sizes. Plan approximately 36 px compact controls, 44 px default targets, and 52–56 px critical checkout controls. Reserve compact targets for dense views and provide adequate hit areas. Verify type at small labels, body, headings, numeric totals, and keypad sizes. |
| Layout sizes | Check 360×640 and 390×844 phones, 768×1024 tablet, 1024×768 compact desktop, 1280×720 target till, 1366×768 and 1920×1080 desktop. Include landscape tablet, Windows 125%/150% scaling, 200% browser zoom, and a second monitor. Verify menu columns adapt with the cart open or rail expanded, readable name wrapping, no page-level horizontal scroll, reachable dialog footers, and no blank Settings scroll region. |
| Input and accessibility | Touch, mouse, keyboard-only, screen reader, reduced motion, forced colors, both palettes, and long names/large currency totals. Aim for WCAG AA contrast, including 4.5:1 for normal text and 3:1 for large text and essential controls. Provide shape, labels or icons for states indicated by color. |

## Rollout sequence

1. Capture baseline cashier, populated cart, login, Settings and print. Audit every color literal, utility color, inline style, SVG fill, and scoped override. Record each intentional exception. Keep in-progress work in place while isolating theme changes for review.
2. Build the shared palette and component recipes. Connect early page paint, Tailwind aliases, React theme switching and packaged Electron setup. Migrate the cashier first and compare against the approved screenshot at till resolution.
3. Migrate shared controls, shell, login, dialogs, checkout, and customer display. Then migrate Receipts, management, reports and Settings. Work through the screen/state matrix in both themes and remove obsolete overrides as each area lands.
4. Verify print, packaging and theme persistence, then capture a final cross-screen comparison. Document the palette file and how to add a new semantic token. Keep generated screenshots and diagnostic output out of Git.

## Acceptance checks

- Change one primary color and its foreground in the central file and verify primary actions across cashier, receipts, management, login and setup. Repeat for surface and text tokens. Check both theme choices, cold launch, reload, window sync and storage failure.
- Review browser and packaged Electron screenshots at the target till size, with at least one smaller touch layout and one larger desktop. Verify every screen in both modes and exercise interactive states through representative fixtures. Check local fonts, slow/missing photos, long text, focus, and no layout shifts during loading.
- Run TypeScript, production builds, and the theme, layout, dialog, checkout, recovery, receipts, reporting, backup and print tests. Add a targeted regression test for shared theme application or first-paint behavior where existing tests miss it. Run the full suite before building the Windows installer.
- Smoke-test the packaged app with disposable data, including owner setup, login, payment, receipt reprint, theme switch, restart, customer display and Settings scroll. Render and inspect both thermal widths and report print output. Check actual printer and monitor behavior on the till when hardware is available.
- Finish when scoped screen overrides are gone, every active component maps to shared tokens, the state/size matrix is checked, and the rebuilt installer carries the shared palette.
