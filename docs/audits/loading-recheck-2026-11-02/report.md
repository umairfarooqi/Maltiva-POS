# Loading verification — 2026-11-02

Result: the Phase 1 changes pass the existing regression suite and the main browser sale flow. Two additional controlled race probes reproduce cache defects; large report rendering remains unbounded. Do not treat the passing suite as coverage of these races.

## Verified findings, in priority order

1. **P1 — old-session bootstrap can repopulate cache after account switching.** `src/services/api.ts:220` checks the token before three asynchronous recovery reads (lines 232–234). The order/staff cache writes at lines 236–240 do not recheck it afterward. A controlled probe paused the first recovery read, cleared storage and changed the token from an admin fixture to a cashier fixture, then resumed it. The new token survived, but the old response wrote two staff profiles and one old order into the new cache and returned `isOnline=true`. Old admin orders can include cost/profit fields. App session guards prevent some direct state updates but do not prevent these shared-cache writes. This is not evidence of a server authorization bypass. Recheck session ownership after asynchronous recovery work and before every subsequent cache commit, and exit rather than falling back and writing on a session-change error. Add a regression asserting that the new session cache remains untouched.

2. **P2 — superseded catalog responses can overwrite newer cached stock.** `src/services/api.ts:142–154` writes catalog data before App's request-sequence guard runs (`src/App.tsx:330–337`). A probe started two requests, resolved the newer response with stock 7, then the older one with stock 8. Cached stock ended at 8. App may keep correct visible state while reload/another reader sees stale cached stock. Move request ownership validation ahead of cache writes, or return data without caching and let the winning caller commit it. Server quote/save validation remains authoritative.

3. **P2 — large reports render every matching order.** `src/components/DashboardView.tsx:318` maps the entire matching list. The real browser loaded a controlled 10,002-order same-day report with correct totals of Rs. 9,901,980, but created **10,002 table rows / 170,240 DOM elements**. Full accessibility inspection timed out, and a subsequent navigation click timed out on the browser evaluation command. A screenshot showed the correct completed report; these are interaction/inspection timeouts, not proof that the report never loads. Prioritize paginated report rows, server date-range totals and bounded checkout startup/cache. Do not truncate the array used to calculate totals.

## Browser and database checks

- Fresh production renderer/server builds, fresh localhost origin, disposable database; 10,001 initial synthetic saved orders and payments. Cloned historical rows deliberately share a business day for a large-report stress case.
- Signed in through the UI, added a Rs. 990 deal, selected Rs. 1,000 cash and completed one sale. Receipt: `#F20261102-10002`, token 10002, change Rs. 10. Receipt and completed-report screenshots are included.
- Request capture showed startup `/api/data`: **17,554,050 bytes / 941 ms**. Saved POST: **201 / 10 ms**, then catalog refresh: **9,078 bytes / 8 ms**. These are localhost proxy response timings, not end-to-end user interaction timings or universal benchmarks.
- No full-history GET followed the saved sale; full history was requested when entering reports and again on deliberate reload, as expected for Phase 1.
- Entered a new one-item cart, visited reports, deliberately reloaded, opened an older receipt (`#F20261102-0001`) and returned to the order screen. The one-item cart survived. Opening the old receipt did not submit another sale.
- Final disposable DB check: integrity `ok`; 10,002 orders, 10,002 payments, zero duplicate idempotency keys. Latest order `completed`, total 99,000 paisa, change 1,000 paisa.
- Browser console: zero warning/error entries in the observed session, including after report/reload/receipt lookup. Server log contained initialization/startup only; captured browser API requests had no error statuses. This is the isolated QA server, not a claim about all historical production logs.
- No physical printer job was sent. Receipt rendering was exercised in the browser; automated printing/reprinting logic is covered by the suite.
- Live workspace database metadata remained 159,744 bytes / last written 2026-10-30 01:36:37. A direct file hash was unavailable because another process held the file. No live DB migration, write, restart or restore was performed.

## Automated checks and evidence

- Fresh full suite: **308 passed / 43 files**, 178.65 seconds. Includes actual isolated server restart, lost response, recovery, ownership, receipt lookup, backup/restore, money and session tests.
- TypeScript, Electron configuration, production renderer build, bundled server build and `git diff --check` passed.
- Two extra diagnostic probes **confirmed defects**; their passing status means the observed faulty behavior was reproduced, not that the desired behavior passed. Archived as `reproduction-probes.test.ts.txt` with output in `race-probe-results.txt`; they were executed from `tests/loading-recheck-probes.test.ts` (their relative imports assume that location). They are not added to the regression suite.
- `requests.jsonl` contains request metadata only (no credentials, authorization headers or response bodies). `server.log`, `test-summary.txt` and `database-check.json` retain the other evidence.
- Application code was not changed during this recheck. Audit artifacts are uncommitted.

Recommended next work: close the session/cache race first, then stale catalog cache writes, then implement the bounded startup and paged reporting phase.
