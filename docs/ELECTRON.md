# Building and running the Windows POS

The default desktop distribution is a Windows x64 NSIS installer. The backend runs in Electron's utility process; customers do not need Node, npm or Visual Studio on the till.

## Build from source

Use a current supported Node version (the implementation was verified with Node 22.23.3). From the repository:

```powershell
npm ci
npm run lint
npm run test:electron
npm run electron:build
```

The installer is `dist_electron/Maltiva POS-<version>-x64.exe` (for example `Maltiva POS-1.5.5-x64.exe`; the version comes from `package.json`). `npm run electron:pack` produces an unpacked directory for QA. `npm run electron:portable` builds the optional portable target. `npm run electron:start` runs the built application from source.

Electron is pinned in both the manifest and builder configuration. `scripts/prepare-electron.cjs` verifies those versions and installs the matching local runtime if needed. Builder copies that distribution instead of downloading/extracting another copy. This avoids the extraction-directory rename failures reproduced on this Windows machine.

SQLite 13 ships a Node-API prebuilt. `npmRebuild:false` deliberately avoids requiring a local C++ toolchain, and the native addon is unpacked from ASAR. This configuration is validated for Windows x64; adding another native dependency or target requires another packaged native smoke check. Keep the lockfile checked in.

## First launch and existing installations

An empty database opens **Create your owner account** before the till. Choose a name, username, password of at least ten characters and four-digit PIN. No default credentials are shipped. Setup is local to the desktop window, with a restricted preload and sender-validated IPC; it is not an HTTP signup endpoint. It cannot overwrite an existing installation, including one with inactive accounts.

Existing installations keep the previous application identity, `appId`, `userData` directory and default origin `http://127.0.0.1:3000`. Database and browser recovery data are not stored next to the EXE. Uninstall is configured to retain application data. Do not rename the package or change the port casually: the browser's outbox, drafts and caches belong to that origin/profile.

The developer server also uses port 3000. Close it before starting the desktop app. The desktop app reports an occupied port rather than killing another process or silently using its server. Opening the desktop app a second time focuses its existing window.

Back up the existing store from **Settings → Database maintenance** before deploying an update. The first-run workflow does not import the repository database. Do not copy an open SQLite file or its WAL files manually to migrate store records.

## Failures and diagnostics

Startup validates database initialization, server binding and the renderer files. A failed startup displays an error instead of opening a broken till. The error includes the exact diagnostic log directory. On Windows, logs are under the app's `userData/logs` directory; `desktop.log` rotates with two prior copies. Startup logs record the current data/resource paths and runtime versions. Owner credentials and IPC bodies are not logged.

Closing the cashier window stops the backend and exits the application, including its customer window. The backend stops accepting requests and closes SQLite; a bounded shutdown timeout handles an unresponsive process. The customer display opens on a secondary monitor, reconnects when monitors change, and can also be opened through Settings. All renderers use context isolation and sandboxing. External navigation/popups and unneeded permissions are denied; trusted receipt clipboard writes remain allowed.

## Desktop smoke tests

After building:

```powershell
npm run test:desktop
node scripts/smoke-electron.cjs dist_electron/win-unpacked/resources/app.asar
```

These use real Electron and the actual backend, hidden offscreen windows, disposable profiles/databases, a stable test origin and a working directory containing spaces. They check first-run setup, login, saved sale, backup, receipt after restart, retained browser storage, missing resources and occupied ports. The ASAR run loads the packaged application files under the same Electron version; it does not click through the NSIS wizard or test physical devices. Evidence is written under `docs/audits/electron-fixes-2026-11-02`.

Before deploying on a till, verify installation/update/uninstall on a spare standard-user Windows account, receipt printing with the actual driver, monitor disconnect/reconnect and recovery after forced termination. Never use live store data for these tests.

## Trusted publisher signing

The local installer is unsigned unless a valid signing certificate is configured. No certificate is included in this repository. Configure Electron Builder's `CSC_LINK` and `CSC_KEY_PASSWORD` through your release environment, then enforce signing for the production release:

```powershell
npm run electron:build -- --config.forceCodeSigning=true
```

Keep certificate files and passwords out of Git. Verify the resulting executable's Authenticode signature; the builder's “signing with signtool.exe” progress line alone does not establish a trusted publisher.
