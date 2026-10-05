# Theme coverage and verification checklist

## Surfaces

- [x] App startup, canvas, selection, focus ring, scrollbar, native controls
- [x] Header, desktop sidebar, mobile navigation and backdrop
- [x] Login, registration, password recovery and quick access
- [x] Order Line categories, product cards, stock badges and checkout shortcut
- [x] Cart items, totals, cash inputs, payment selection and feedback
- [x] Variation options, notes and quantities
- [x] Dishes & Deals categories, grid, list, margins and dropdown
- [x] Dish, deal, category, stock and delete dialogs
- [x] Daily Sales / dashboard filters, tables, statuses and empty states
- [x] Profit & Loss filters, summaries, tables and print output
- [x] Settings panels, controls, appearance, maintenance and confirmation
- [x] Customers, staff, table management and Help Center
- [x] Separate customer display window
- [x] Pending-sync and recovery feedback
- [x] Receipt controls and light preview paper

## Behavior and validation

- [x] Default dark; saved light and invalid preference handling
- [x] Immediate switch and local persistence
- [x] Storage-event synchronization and unavailable-storage fallback
- [x] Both themes at desktop and phone widths
- [x] Text and primary-action contrast checks
- [x] Receipt preview and print token isolation
- [x] Relevant automated tests, TypeScript and production build

Implementation results are recorded here as verification completes.

## Verification results

All listed surfaces were migrated to semantic colors and audited for remaining hardcoded UI colors. Logo fills and white switch thumbs are intentional exceptions. Browser checks covered Order Line and Settings, both themes, reload persistence, and phone-width Settings. Theme tests cover default/invalid preferences, blocked storage, keyboard switching, window synchronization, and text/status/control contrast. Existing UI and print tests passed; receipt paper is explicitly isolated to light tokens and print rules force light colors for receipts and reports. Physical printer output was not tested.
