# Receipt lookup verification

Verified on 2026-11-01 using synthetic data in the isolated POS at port 60621.

- Admin preview: receipt navigation, paged summaries, canonical detail and cash received/change were visible. The existing one-item test cart was preserved.
- Cashier preview: sidebar showed Order Line and Receipts without reports/settings. A full reference found an October 15 receipt created by a different operator while the date filters showed November 1. Saved detail displayed its original item, amount, cashier, token, tender and change.
- Returning to Order Line preserved the cashier's one Rs. 60 cart line and Rs. 2,000 tender. No checkout or physical print was submitted during browser verification.
- `cashier-receipts.png` shows the cashier's historical lookup; `cashier-receipt-preview.png` shows its saved detail. `receipts.png` shows the compact admin preview. These contain synthetic QA data, not live customer sales.
- Automated verification: 293 tests across 41 files passed. Physical printer output and installed Electron packaging were not exercised by this browser check.
