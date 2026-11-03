# Electron packaging and runtime audit — 2 November 2026

**Verdict: the current desktop setup has reproducible build and startup defects. A successful Vite build or the existing Electron configuration test does not establish that the EXE works.**

Audited current working tree on `codex/session-privacy-lockout`, HEAD `6871152`, including existing staged changes. Application source, manifest, lockfile and live POS database were not changed by this audit. New audit probes and recommendations are in this folder. Renderer/server build outputs were regenerated. Electron's missing runtime was downloaded during the checks. Runtime probes used disposable databases, fresh profiles, separate ports and hidden windows; the existing server on port 3000 was left running.

The original reported EXE and its error messages were not available in this workspace: `dist_electron` contained only `builder-effective-config.yaml`. Therefore these are findings against the current source and a newly generated isolated package, not a forensic diagnosis of that exact older EXE.

## Confirmed findings, in repair order

### 1. P1 — Production UI assets depend on the launch folder

Locations: `server.ts:756–758`; backend entry `electron/main.cjs:18`.

Production uses `path.resolve(process.cwd(), 'dist')`. An installed or portable application's working directory is not a reliable location for its resources, and its renderer is packaged under `resources/app.asar/dist`.

Reproduction with the freshly built backend:

| Launch context | Health | POS page | Result |
| --- | --- | --- | --- |
| Repository working directory | 200 | 200 | React app present |
| Unrelated temporary directory | 200 | 404 | `ENOENT ...\dist\index.html` |

Real Electron 44.5.1 reproduced the same distinction. Loading the newly generated ASAR's actual main/backend files in real Electron also produced a page titled **Error**, body **Not Found**. SQLite loaded successfully in that ASAR test, distinguishing the renderer-path failure from a native-addon failure.

**Repair:** make the server accept an explicit absolute renderer directory. Electron can supply `path.join(app.getAppPath(), 'dist')`; standalone Node startup should derive the equivalent path from its compiled server location. Validate `index.html` before declaring readiness. Serve it through Electron's ASAR-aware filesystem. If resources are later moved outside ASAR, use `process.resourcesPath` and matching `extraResources` rules instead. Changing the installer target alone will not fix this.

Evidence: `probe-results.json`, `runtime-repository-cwd.json`, `runtime-unrelated-cwd.json`, `runtime-asar-unrelated-cwd.json` and associated logs.

### 2. P1 — Default packaging fails rebuilding SQLite on this machine

The isolated default `electron-builder --win --x64 --dir --publish never` run reached `@electron/rebuild` and failed for `better-sqlite3` with **Could not find any Visual Studio installation to use**. The temporary staging path also triggered a spaces-in-path warning; the original repository path contains no spaces, so that warning is not evidence of an original-project path defect.

Important version-specific distinction: this repository uses **better-sqlite3 13.0.3**, whose `binding.gyp` uses **Node-API 10** and whose package includes `prebuilds/win32-x64.node`. Old advice to rebuild every SQLite binary for Electron's exact V8 ABI is incomplete here. The project's shipped prebuilt successfully executed an in-memory SQLite query in **Electron 44.5.1 / Node 24.21.0 / Node-API 10**, both from the workspace and from ASAR. The upstream [v13 release notes](https://github.com/WiseLibs/better-sqlite3/releases/tag/v13.0.0) explain this change.

An isolated follow-up with **only `npmRebuild=false` changed** completed directory packaging with exit 0. Builder automatically unpacked the SQLite native binary; its absence from explicit `asarUnpack` configuration was not the reproduced defect.

**Repair choices:** use the validated prebuilt approach for the supported Windows x64 target, with a packaged native-query smoke check on every runtime/dependency update; or retain rebuilds and install a supported Visual Studio C++ build toolchain and SDK. Do not blindly add `nodeGypRebuild`, downgrade SQLite, or disable rebuilding for arbitrary future native dependencies. The proposed prebuilt config needs revalidation against its proposed patched Electron version before release.

Evidence: `package-build.txt`, `package-result.json` (failed default run), `package-prebuilt.txt` (successful override run), real Electron JSON results. The first preparatory staging attempt omitted Electron's dev-package metadata and failed version resolution; that harness omission was corrected before the archived default run and is not counted as a project defect.

### 3. P1 — Startup failures still open the terminal; diagnostics are lost

Locations: `electron/main.cjs:11–35,85–94`; `server.ts:763–768`.

After a synchronous backend error or readiness timeout, the catch logs to console and execution opens the cashier/customer windows anyway. Both cases were reproduced against the actual main-process source using mocked Electron APIs. Production console output is not a usable support log.

The backend is required for side effects rather than returning a startup promise and server handle. Its async initialization catch sets `process.exitCode` without notifying Electron. Listen errors are emitted asynchronously and are not caught by the surrounding startup try/catch. `loadURL` promises are ignored. No handlers record failed navigation, renderer crashes or unresponsive windows. Also, each readiness fetch has no abort signal, so the apparent 15-second deadline does not bound an individual stalled request.

**Repair:** expose an explicit start/stop contract; reject startup on DB, migration, bind or asset-validation failure. Log to a bounded file under `app.getPath('logs')`, including application/runtime versions and data/resource paths without credentials or request bodies. Present a native startup error with log location and retry/exit, and return before opening the POS. Await navigation and record renderer/process failures. Give each health request a timeout. On shutdown, stop accepting requests and close the database after in-flight work finishes. Test saved/pending sale recovery after forced termination; WAL alone is not that verification.

### 4. P1 — Port 3000 collides; no single-instance protection

Locations: `electron/main.cjs:8–9`; `server.ts:762–763`.

The app defaults to fixed port 3000 without `requestSingleInstanceLock`. The existing development server currently occupies `127.0.0.1:3000`. A disposable two-server test reproduced an unhandled `EADDRINUSE` and exit 1. Double-opening the desktop app can cause the same conflict.

Health accepts any HTTP 200 and does not identify the owning backend. Inherited `HOST` can also bind somewhere other than the loopback address the window requests, or expose the service on all interfaces.

**Repair:** acquire the single-instance lock before database/server initialization and focus the existing cashier window on a second launch. Keep a stable localhost origin unless there is a deliberate migration plan: drafts, IndexedDB outbox and localStorage are origin-bound, so randomizing the port on every launch would strand recovery data. Handle occupied ports explicitly, pin the desktop bind host to loopback, and establish ownership through the startup contract and a per-launch readiness value. Do not reuse or kill an arbitrary service on port 3000.

Related: `start_pos.bat` currently force-kills any listener on port 3000 and launches the development server. It is not a suitable production recovery launcher.

### 5. P1 — Fresh installed data has no administrator and no packaged provisioning tool

Locations: `server.ts:134`; `src/services/db.ts:10–13`; `scripts/manage-admin.cjs:35–56`; `package.json:65–70`.

Electron correctly uses its writable `userData` directory for SQLite, separate from the repository database. But fresh database probes returned **zero staff accounts**. No accounts are seeded, login requires an existing account, and the only provisioning CLI is excluded by the package file allowlist. Archive inspection confirmed that both the CLI and repository database are absent. Excluding the development database is good; the missing setup workflow is the defect.

Running `npm run admin:setup` from the repository normally targets the repository DB, not the Electron DB. The CLI also assumes the target directory exists and uses insecure default credentials if arguments are omitted; those defaults should not become an installer setup workflow.

**Repair:** add first-run owner provisioning, restricted to an empty local database and controlled by the main process; require chosen credentials. Alternatively ship a deliberate offline support provisioning tool against an explicitly selected application database, without requiring Node/npm on the till. Plan migration/import of existing store data through verified backup/restore, not silent copying of an open SQLite file. Preserve the current userData location until a tested migration exists; renaming `react-example` without checking the runtime data path can make existing data appear missing.

### 6. P1 — Installed Electron version has a current security advisory

The manifest and lockfile resolve Electron **44.5.1**. `npm audit` and the upstream [Electron advisory](https://github.com/electron/electron/security/advisories/GHSA-jr5w-w6x2-84p9) identify the compromised-certificate mitigation as fixed in **44.9.1** on that major line. This app requests external fonts/images, so it is not wholly network-free. This is a security update requirement, not evidence that it caused the reported EXE errors or that an attack occurred.

Production audit: **3 flagged packages — 2 high, 1 moderate** (`body-parser`, `vite`, `qs`). Full audit: **21 — 4 high, 17 moderate**. These counts are package advisory classifications, not 21 demonstrated exploits. The `body-parser` advisory is particularly relevant because `express.json()` runs before authentication and the backend shares Electron's main process; upstream documents a request-triggered process termination. That crash payload was not exercised. Vite's development server is not started in production, which limits interpretation of its advisories.

**Repair:** pin and test a patched supported Electron release, refresh the lockfile deliberately, update affected server dependencies, and rebuild the bundled server. Installing a fixed Express dependency without rebuilding `dist-server/server.cjs` leaves the old bundled parser in the executable. See the [body-parser advisory](https://github.com/expressjs/body-parser/security/advisories/GHSA-27r3-jxmh-p828).

### 7. P2 — Renderer hardening is incomplete

The actual POS response had no Content Security Policy. Real development Electron emitted its insecure-CSP warning. Its absence from a packaged console is not evidence of a fix: Electron suppresses that warning after packaging.

Good existing protections: `nodeIntegration:false`, `contextIsolation:true`, default `sandbox:true` confirmed in real Electron; preload exposes no privileged API; no `webSecurity:false` or broad IPC bridge was found.

Gaps: no permission allowlist, navigation restriction or controlled popup handler. Settings legitimately opens `/customer-display`, so hardening must preserve that route deliberately. Add a production CSP compatible with the inline theme initialization, CSS, receipt-print iframe, local assets and approved image sources. Prefer bundled fonts/assets for offline tills. Keep permissions denied unless a specific POS function needs them. Restrict windows to the app's exact origin/approved routes. These recommendations follow the [Electron security checklist](https://www.electronjs.org/docs/latest/tutorial/security).

### 8. P2 — Backend work shares the UI control process

`require(server.cjs)` runs Express, synchronous SQLite queries/migrations and synchronous password hashing in Electron's main process. Large report/bootstrap work or a backend crash can stall or terminate the whole desktop shell. This is an architectural risk established by the process layout; no production-scale UI stall benchmark was run in this audit.

**Recommended next step:** keep React/Vite, Express and SQLite, but move the backend to Electron's [utility process](https://www.electronjs.org/docs/latest/api/utility-process), with readiness, failure and shutdown messages. It uses Electron's bundled Node runtime, so a customer machine does not need a separate Node installation. Do this after fixing the immediate path/startup defects, preserving database ownership, origin and checkout recovery semantics.

### 9. P2 — Distribution and packaged testing are not release-ready

The current target is portable only; app version is `0.0.0`, package name remains `react-example`, and icon/author/description are missing. The isolated unpacked package was **534,616,159 bytes (~510 MiB)**; `app.asar` was **79,111,062 bytes** with **6,657 entries**. Vite, build plugins, unused GenAI dependencies and native binaries for other operating systems are shipped. This is unnecessary payload for the current runtime. File allowlists do not automatically suppress production dependencies.

The generated EXE's Authenticode status was **NotSigned**. Builder's log line “signing with signtool.exe” does not prove a trusted publisher signature. A signed NSIS per-user installer is the recommended normal till distribution; portable can remain a separately tested support target. Retain user data on uninstall. Add an actual `.ico`, meaningful versions and a controlled update/rollback procedure with database compatibility checks. No certificate was configured and no installer was published during this audit.

Existing `test:electron` checks source strings/config presence. The customer-route regression uses mocked Electron. Both pass while the demonstrated packaged page is broken. Neither is an installed desktop smoke test.

Printing currently uses a renderer iframe and `window.print()`, not Electron printer selection/silent-print IPC. That is valid for interactive printing; named-printer routing, silent dual slips, drawer cutting and physical paper output are not established. Existing print tests pass but do not prove driver/hardware behavior. Customer display now uses the correct `/customer-display` route; the earlier audit's root-route bug has already been fixed. Monitor creation only runs at startup and there is no hotplug/reconnect policy; physical dual-monitor layouts were not tested. The synthetic nonzero-origin monitor probe is a heuristic stress case, not a confirmed Windows hardware defect.

## Recommended setup for this POS

Keep the existing toolchain; a migration to Forge or electron-vite is not necessary to fix these defects. Use Windows x64, a supported patched/pinned Electron, SQLite's validated Node-API prebuilt, ASAR for application code, a stable writable database directory, stable localhost origin, one terminal instance, explicit startup/shutdown, bounded logs and a signed NSIS installer. Move build-only packages (`vite`, its plugins and Tailwind tooling) to dev dependencies and remove unused dependencies only after verifying imports and rebuilding. For further size reduction, a minimal runtime package can contain the compiled app plus SQLite and its actual runtime dependencies.

`electron-builder.recommended.json` is a **schema-validated proposal, not active project configuration or a release-tested installer**. It proposes Electron 44.9.1 and `npmRebuild:false` based on the successful 44.5.1/x64 prebuilt experiment. Re-run the native and packaged-app smoke checks on 44.9.1 before adopting it. It assumes the application/startup fixes above; this config alone cannot make the current application release-ready. Keep the lockfile's Electron version aligned with `electronVersion`. Do not add a default `postinstall` rebuild that recreates the demonstrated C++ failure.

Suggested scripts after fixes: separate `electron:pack` (`--dir`) from `electron:dist` (`--win nsis --x64 --publish never`), plus an optional portable command. Run desktop QA from a folder containing spaces, a standard non-admin account and a clean machine with no Node, npm or Visual Studio installed. Replace the POSIX `rm -rf` clean script with a cross-platform Node script if Windows developers use it.

## Validation completed and remaining acceptance

| Check | Result |
| --- | --- |
| `npm run build:electron` | Passed; renderer chunk-size warning only |
| `npm run lint` | Passed |
| `npm run test:electron` | Passed; static checks only |
| Print/customer display focused suite | 19 tests passed across 4 files |
| Fresh production Node backend in two launch folders | Confirmed UI-path defect; fresh staff count 0 |
| Disposable port collision | Confirmed unhandled `EADDRINUSE` |
| Actual main source with mocked startup failures | Confirmed windows open after failures |
| Real Electron workspace and ASAR smoke probes | SQLite passed; unrelated launch directory failed to render POS |
| Default isolated directory packaging | Failed native rebuild |
| Same stage with `npmRebuild:false` | Completed, exit 0; archive inspected |
| Original user's EXE / portable extraction / NSIS installation | Not tested |
| Patched Electron 44.9.1 / physical printer / monitor hotplug | Not tested |

The ASAR smoke test used the actual packaged main, server, renderer and native dependency under the matching Electron runtime, with hidden windows and a disposable profile. It did not launch the packaged executable directly or exercise installer extraction. The full general application suite was not rerun because no application code was changed.

Before release, require a packaged smoke test that starts outside the repository, verifies the actual React UI and owned backend, provisions a fresh owner, saves/reopens a sale on a disposable DB, preserves the same outbox across restart/update, handles occupied port and failed initialization, verifies customer window/logout, exports/restores a backup and prints with the intended thermal driver. Test migration against a copy of existing store data, including application identity/data paths; never replace live data for QA.

Official references consulted: [builder v26 configuration](https://www.electron.build/v26/docs/configuration/), [builder v26 Windows options](https://www.electron.build/v26/docs/win/), [builder v26 NSIS](https://www.electron.build/v26/docs/nsis/), [Electron app lifecycle/data/log paths](https://www.electronjs.org/docs/latest/api/app), [Electron ASAR behavior](https://www.electronjs.org/docs/latest/tutorial/asar-archives), and the linked security/native-module references above. v26 documentation is intentional: the installed builder is 26.15.3; copying v27-only configuration would be inappropriate.
