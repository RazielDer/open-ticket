# Login CSRF Recovery

## Intent

Prevent stale login pages from dead-ending on a raw CSRF error while keeping CSRF enforcement strict everywhere else.

## Locked direction

- Recover only the unauthenticated login POST path
- Keep valid login, session, and return-to behavior unchanged
- Keep hard CSRF rejection on authenticated POST routes

## Verification target

- `npm run build`
- `node --test dist/plugins/ot-dashboard/test/app.test.js dist/plugins/ot-dashboard/test/auth.test.js dist/plugins/ot-dashboard/test/home-setup.test.js`

## Results

- Passed `npm run build`.
- Passed `node --test dist/plugins/ot-dashboard/test/app.test.js dist/plugins/ot-dashboard/test/auth.test.js dist/plugins/ot-dashboard/test/home-setup.test.js`.
- Added regression coverage proving that a stale login CSRF submission redirects back to `/login` with a fresh prompt.
- Kept the authenticated CSRF rejection path covered by a targeted POST test.
