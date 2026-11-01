# Loading fixes verification — 2026-11-02

## Changes

Bootstrap validates the initiating session and caller after asynchronous recovery reads, before any snapshot cache writes, and on both error and offline fallback paths. Obsolete operations reject without returning cache data to App. App passes cancellation/session ownership and ignores obsolete sync failures. Catalog requests validate their own sequence and App's checkout/session ownership before committing cache or UI state.

Daily Sales renders at most 50 receipt rows, with previous/next/last pages and filter reset. Pagination does not change any financial calculation: totals/counts/payment breakdowns/comparisons use the complete matching history. Server-side range totals and smaller checkout bootstrap are explicitly planned in the loading plan, not claimed as implemented.

## Browser measurements

Fresh production renderer and bundled server, separate localhost origin `127.0.0.1:60732` proxying an isolated server at 60731, newly initialized disposable SQLite database under a unique OS temporary directory. No use of the older 60621 app. Synthetic fixture: 10,002 same-day saved orders/payments, then one UI checkout.

- Before checkout: complete total **Rs. 9,901,980**, **50 rendered rows / 1,060 DOM elements**. The previous audit measured 10,002 rows / 170,240 elements for its controlled fixture. Fixtures differ in reference lengths; DOM row bounding is the relevant comparison.
- Last page rendered 2 rows and stayed interactive; one last-page browser-tool click completed in 304 ms. This includes automation overhead and is not an INP measurement or a general device benchmark.
- After checkout: 10,003 saved orders, complete total **Rs. 9,902,970**, still 50 rows / 1,060 elements. Final production bundle reload, last-page navigation, Card Only → All Modes reset to page 1 verified. Screenshot: `report.png`.
- Real UI sale `#F20261102-10003`: Rs. 990, Rs. 1,000 tender, Rs. 10 change. Last receipt reopened the same order. An older `#F20261102-0001` receipt opened separately. A new Rs. 60 cart survived report navigation, reload and older receipt lookup. No print action was invoked.
- Real UI admin logout → cashier login completed. Cashier navigation exposed Order Line/Receipts only. Existing automated role/privacy tests verify stripping financial costs; UI navigation alone is not a privacy proof.
- Browser console: zero warning/error entries in both observed tabs. Request capture: 64 API requests, no status >=400. Server log contains initialization/startup only. The disposable server was initialized once before the fixture loader's first attempt failed to import a Windows ESM path; only that disposable process was stopped and started again. No live process was touched.
- Captured sale POST: 201 / 19 ms; following catalog refresh: 9,078 bytes / 6 ms. No full-history GET followed checkout until deliberate reload/report entry. These are local proxy response timings, not end-to-end user latency.
- Startup remains large: captured admin full-data responses were 17–18 MB (initial fixture references were subsequently shortened), and cashier full-data response was about 15.5 MB. This fix does not claim bounded startup/network or server-side report totals.

## Controlled browser races

A separate browser page built with esbuild from the current actual API/storage/outbox services pauses recovery and resolves catalog fetches in reverse order. It uses synthetic session tokens/data on the disposable origin, not live credentials. The main app was loaded afterward with actual disposable-server authentication. The harness is archived as `browser-probes.ts.txt`; these are controlled service probes, not a claim that human-speed account switching naturally hit the race.

- Online bootstrap paused at recovery read → switch admin fixture to cashier fixture → resume: rejected as SessionChangedError; new cache unchanged.
- Offline fallback paused at recovery read → switch session → resume: rejected; new cache unchanged.
- Two catalog responses resolved newer(stock 7) then older(stock 8): older rejected; cache retained stock 7.
- Browser output: `browser-probes.txt`. Automated regression tests additionally cover switching during each of list/rejected/acknowledged reads, failures after switching, and caller cancellation.

## Data safety and limits

Final disposable database: integrity `ok`, 10,003 orders, 10,003 payments, zero duplicate idempotency keys; latest sale completed. See `database-check.json`. Request evidence contains metadata only, no authorization headers or response bodies.

Repository live DB metadata remained 159,744 bytes / UTC modification 2026-10-29 20:36:37 (Pakistan time 2026-10-30 01:36:37). No live write, initialization, migration, restore, restart, physical print, commit or push was performed. Metadata is not a file-content hash. Browser tests used the desktop browser environment, not installed Electron or lower-end hardware.


## Automated verification

- Final complete run: **319 tests passed / 44 files**, 170.52 seconds (`npm test -- --maxWorkers=1 --reporter=dot`). Includes 10 new request-ownership regressions and one 10,002-order pagination regression, plus the existing 308 tests. Existing jsdom navigation and React act warnings remain non-failing.
- Focused run: **16 passed / 2 files**, including the new races and report coverage.
- TypeScript, production renderer build, bundled server build, Electron configuration checks and `git diff --check` passed. Build outputs stayed in the disposable temporary directory.
- The first report test attempted 200 next-page clicks and exceeded its default deadline; Last page now makes the same final-page assertion directly. A subsequent full run loaded the report module before its UTF-8 repair and passed 318/319 tests; the final complete run above uses the repaired files. These earlier failures are not counted as successful verification.
- Existing uncommitted performance changes and original audit artifacts were preserved on `codex/faster-pos-loading`. Nothing committed or pushed.
