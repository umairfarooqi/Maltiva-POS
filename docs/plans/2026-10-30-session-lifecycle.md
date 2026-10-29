# Session lifecycle implementation

Date: 2026-10-30
Scope: session cancellation, startup verification, expiry handling and cross-window logout following the API authentication phase.

## Behaviour

- Signed tokens now reference a persistent `auth_sessions` row with a unique session ID, user, scope and expiry. Every protected request validates both the signature and the active server session. Sessions retain the existing twelve-hour lifetime; manager approval tokens retain their separate five-minute scope.
- Logout deletes the current session. PIN/password resets, role changes and activation changes revoke all of that user's sessions, including approval tokens, in the same database transaction. Name-only edits retain sessions. CLI administrator credential resets also revoke sessions.
- `GET /api/auth/session` returns the authenticated user and expiration, without credentials or internal session IDs. API responses use `Cache-Control: no-store`.
- Startup verifies the saved token before mounting private screens. Cached user details cannot establish access. An unavailable server leaves startup locked with a retry action; an already verified session can continue during a server outage only until its established expiration.
- Login supplies the expiration immediately. Session checks also run every thirty seconds and on online/focus/visibility events. The app locks at expiration without requiring another API request.
- Protected API calls centrally handle session-invalid responses. Ordinary permission errors and an incorrect manager PIN do not log out a valid cashier.
- Logout and token changes in other windows immediately lock the current UI; a replacement token is verified before reopening it. Delayed responses cannot clear a newer session or restore private screens after logout.
- Draft baskets, submitted attempt identities and IndexedDB pending sales survive session loss. Customer-display basket content is hidden while locked. Checkout callbacks and background replay stop crossing session changes, retaining the same recovery key rather than creating a replacement sale.
- Offline logout locks locally immediately and stores a revocation request. The request is retried on reconnect, session checks and subsequent login. A former session's revocation cannot cancel a newer login. If browser storage is unavailable, the app still locks and attempts a direct server revocation; both storage and server being unavailable prevents guaranteed deferred revocation.

## Upgrade and operating notes

- The new session table is created during normal server initialization. No sales or financial migration is introduced.
- Previously issued tokens without a registered session ID are deliberately invalid after upgrading. Staff must sign in again; retained drafts and pending sales remain recoverable.
- A running app/server must load the updated builds for these protections to take effect. No production server was restarted, and the live database was not opened or migrated during this work.
- Server-side revocation is immediate once acknowledged. Other clients discover external account resets on their next request, focus/visibility check, or thirty-second session check.

## Verification

- New server tests exercise logout across restarts, independent logins, password/PIN/role/deactivation revocation, approval scope, CLI reset, genuine expired signatures and rollback if revocation fails.
- Client/UI tests cover startup verification, offline retry, cached-role rejection, 401 handling, permission errors, offline logout replay, cross-window token replacement, expiration timers and delayed response races.
- Sale recovery tests include ending a session while its save acknowledgment is delayed, retaining the draft and pending identity without reopening a receipt or sending another background request under the changed session.
- `npm test -- --maxWorkers=2 --reporter=dot`: **206 tests across 29 files passed**. Tests use disposable databases. Existing jsdom navigation and React act warnings are non-failing.
- Type checking, renderer/server builds, Electron configuration checks and `git diff --check` pass. Build outputs were generated outside the repository.

## Remaining authentication work

Canonical account lockout (including username/email aliases), original-cashier attribution for an uncommitted pending sale replayed by another staff member, security audit events and broader browser-cache protection remain separate work. This phase does not claim production readiness or installed Electron/manual multi-window verification.
