# API authentication and confidential data protection

Date: 2026-10-30
Scope: priorities 1 and 2 from the authentication review.

## Implemented

- API access requires a valid active admin, manager or cashier session by default. The only public method/path pairs are GET `/api/health`, GET `/api/auth/staff`, and POST `/api/auth/login`.
- Existing product/category/inventory/settings/order mutations use strict role guards. Sale and stock identities come exclusively from authenticated callers.
- Public health exposes only readiness. The login picker exposes only active staff IDs, names, usernames and avatars; no account roles, emails, credentials, financial history or stock records.
- Login loads the public picker first, then private bootstrap after successful authentication. Full staff records in bootstrap are restricted to administrators.
- Cashier product, quote, sale, bootstrap and recovery responses exclude costs/profit, including nested bundle and variation costs. Administrator financial snapshots remain intact.
- Recovery status requests include authentication. Authorization failures stop replay without deleting or rejecting durable pending sales; the original recovery key remains available after sign-in. A POST authorization failure also retains its pending intent because an earlier attempt may already have committed.
- Malformed signature bytes and invalid/expired token timestamps fail authentication.

## Validation

- `npm run lint`: passed.
- `npm test -- --maxWorkers=2 --reporter=dot`: 180 tests across 26 files passed.
- Renderer and bundled server builds: passed, generated in temporary directories.
- `npm run test:electron` and `git diff --check`: passed.
- New coverage includes protected-route missing/invalid/expired tokens, inactive accounts, role restrictions, minimal public data, nested cost removal, login-to-bootstrap sequencing and pending recovery through authorization failure/sign-in.
- An unconstrained-worker run hit the existing five-second checkout-test timeout; the complete two-worker run passed. Existing jsdom navigation and React act warnings are non-failing.
- Tests use disposable databases. The live database was not opened or migrated, and no running server was restarted.

## Remaining authentication work

Follow-up: session cancellation, startup verification, expiry and cross-window logout are implemented in the [session lifecycle phase](2026-10-30-session-lifecycle.md). The paragraph below records the boundary of the original API phase.

This change does not implement session revocation on logout or credential reset, startup session verification/centralized expiry handling, cross-window logout, canonical account lockout, original-cashier recovery attribution, or security audit events. Those remain the next authentication phases. Browser cache protection and the complete manager/UI permission alignment also remain outstanding.

Existing running processes need the updated application/server build before these changes take effect. This is not a deployment or production-readiness claim.
