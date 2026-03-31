# Login-First Entry Consolidation

## Intent

Replace the separate landing-page entry with a single login-first dashboard entry that keeps the UI centralized and simpler for non-technical users.

## Locked direction

- Root redirects to login
- Branding lives inside the login card
- No icon art in the login UI
- Inline health feedback, not route navigation
- Minimal copy and one central surface

## Verification target

- `npm run build`
- `node --test dist/plugins/ot-dashboard/test/app.test.js dist/plugins/ot-dashboard/test/auth.test.js dist/plugins/ot-dashboard/test/home-setup.test.js`

## Results

- Passed `npm run build`.
- Passed `node --test dist/plugins/ot-dashboard/test/app.test.js dist/plugins/ot-dashboard/test/auth.test.js dist/plugins/ot-dashboard/test/home-setup.test.js`.
- Verified `/` redirects to `/login?returnTo=%2Fadmin`.
- Verified the login page renders one central card with text-only branding and no separate banner block.
- Verified the `Health` action updates inline status text inside the card instead of navigating away.

## Browser proof

- Disposable preview server: `http://127.0.0.1:3371`
- Reason: the long-running `http://127.0.0.1:3360` instance was still serving an older build during verification.
- Screenshots:
  - `output/playwright/login-page.png`
  - `output/playwright/login-health-inline.png`
