# Electron fixes and packaged verification — 2 November 2026

Implemented the repair recommendations from the prior Electron audit. The Windows x64 NSIS installer is `dist_electron/Maltiva POS-0.1.0-x64.exe` (approximately 120 MiB). Its exact size, SHA-256 and Authenticode status are in `installer.json`. **The installer is unsigned: a publisher certificate has not been configured.** Nothing was published, and the installer was not installed over the user's current environment.

## Changes

- Pinned Electron **44.10.1**, updated Vite to **8.3.5**, Express to **4.22.3**, body-parser to **1.20.9**, qs to **6.16.2** and affected undici resolutions through normal compatible lockfile updates. The current production dependency audit has **zero advisories**. The full development tree has **16 moderate advisories, zero high/critical**. No forced major dependency rewrite was applied.
- Production renderer paths are absolute and independent of the launch folder. Startup verifies `index.html`; startup failure never opens a broken terminal.
- The backend now runs in an Electron utility process, with an explicit initialization acknowledgement, startup error messages, a shutdown contract and bounded timeouts. Express bind errors are awaited. SQLite and synchronous server work no longer run in the desktop UI control process.
- Added a single-instance lock, second-instance focus, explicit occupied-port errors and a fixed loopback bind. Preserved application identity, `appId`, default port/origin and the existing `userData` policy. No live database migration or data replacement was performed.
- Added bounded rotating diagnostic logs with runtime/data/resource paths and process failures. Owner credentials and IPC bodies are excluded from logs.
- Added a first-run owner setup window for databases containing no users. Inputs are validated again in the backend; passwords/PINs are hashed. Setup cannot replace existing users, including inactive accounts. There is no HTTP setup endpoint. The restricted preload exposes only owner submission; the main process checks the exact setup frame and webContents before forwarding it.
- Added sandboxing explicitly, production CSP, controlled navigation/popups and permission restrictions. Trusted sanitized clipboard writes remain allowed for receipt copying; clipboard reads and unrelated permissions are denied. Settings can still open the dedicated customer display.
- Added customer-window reconnect handling and made cashier-window closure stop the application and backend together. Physical monitor behavior remains a hardware acceptance check.
- Removed unused GenAI/dotenv dependencies and moved Vite/build plugins to development dependencies. Bundled the existing POS font locally. Added an application icon derived from the existing MaltivaLogo emblem. Added meaningful version/metadata and a per-user NSIS target that retains app data on uninstall, with a separate portable build command.
- Removed the launcher's force-kill behavior and replaced its development-browser startup with the desktop entry. Made cleanup cross-platform. Removed insecure default CLI provisioning credentials and ensured its selected data directory is created.
- Added explicit runtime version preparation. Builder uses the installed matching Electron distribution, avoiding the reproduced Windows extraction-directory rename error. `npmRebuild:false` uses SQLite 13's tested Windows x64 Node-API prebuilt; its native binary is outside ASAR. Customers do not need Node/npm/Visual Studio.

The packaged ASAR is **47,977,519 bytes**, down from **79,111,062 bytes** in the audit's comparison build. The unpacked application is **460,328,652 bytes**, down from **534,616,159 bytes**. Inspection confirms Vite and GenAI are absent and SQLite is unpacked. The packaged main-process file was compared byte-for-byte with the final working-tree source and matched.

## Validation

| Check | Result |
| --- | --- |
| TypeScript | Passed |
| Application suite, one worker | **370 passed / 49 files**, exit 0 |
| Electron config/runtime behavior suite | **5 passed**, exit 0 |
| Renderer/server production builds | Passed; existing renderer chunk-size warning remains |
| NSIS x64 installer build | Passed, exit 0 |
| Real Electron 44.10.1, final packaged ASAR, unrelated working folder containing spaces | Passed |
| Empty-profile owner setup | Rejected weak credentials, created owner, authenticated successfully |
| Existing-profile restart | Skipped setup, authenticated existing owner, reopened saved sale |
| Saved sale and backup | Committed a disposable sale and produced a verified database backup |
| Stable origin | Browser localStorage marker survived actual Electron restart |
| Occupied port | Useful startup error, no POS windows opened |
| Missing renderer | Useful startup error, no POS windows opened |
| Renderer security | Sandboxing and CSP confirmed; final smoke output contains no renderer errors |
| Setup visual review | Captured and inspected `owner-setup.png` and `terminal-login.png` |
| Whitespace/diff check | Passed |

The smoke harness loads the **actual packaged main, backend, renderer and SQLite dependency under matching real Electron**, with hidden offscreen windows and fresh temporary profiles/databases. It is instrumented for automated setup/error handling; it does not launch an untouched installer wizard or exercise real printer hardware. Its browser storage check verifies origin persistence, while existing application tests cover outbox/recovery semantics. It does not claim a forced-power-loss test on a physical till.

Two earlier validation runs were not counted as passes: the first application run overlapped removal/replacement of the obsolete route test, and the subsequent parallel run had one connection reset in the 10,000-order performance fixture. That fixture passed when rerun alone, and the complete final serial run passed all 370 tests without changing its assertions. The ordinary non-failing jsdom navigation and React act warnings remain in the suite output.

The default builder download/extraction path failed twice with a Windows `EPERM` rename of `win-unpacked.tmp`. The implemented version-checked local distribution path then built successfully, including a final rebuild after the clipboard-permission correction. Intermediate failed-build logs are retained for diagnosis; `installer-build.txt` is the successful final build.

## Remaining release prerequisites

Configure a valid publisher signing certificate and build with enforced signing for trusted distribution. Confirm NSIS installation/update/uninstall on a spare Windows account, actual thermal printer output and customer-monitor reconnect behavior. The optional portable target is configured but was not built in this implementation pass. Automatic updates, silent named-printer routing and cash-drawer integration were not added.

The development server on port 3000 was intentionally left running. Close it before launching the desktop app; the new desktop startup will report that conflict instead of terminating it. The repository/live store database was not changed by the implementation checks. Disposable smoke-profile paths are recorded in `profile.json`.

Build, operation, diagnostics and signing instructions: [docs/ELECTRON.md](../../ELECTRON.md).
