# Login Brand Normalization

## Intent

Remove the redundant `Admin access` text and make the dashboard-name treatment feel more normal and balanced inside the login card.

## Locked direction

- No eyebrow above the brand title
- Brand title stays identifiable but less oversized
- No route, auth, or health-utility changes

## Verification target

- `npm run build`
- `node --test dist/plugins/ot-dashboard/test/app.test.js dist/plugins/ot-dashboard/test/auth.test.js dist/plugins/ot-dashboard/test/home-setup.test.js`

## Results

- Passed `npm run build`.
- Passed `node --test dist/plugins/ot-dashboard/test/app.test.js dist/plugins/ot-dashboard/test/auth.test.js dist/plugins/ot-dashboard/test/home-setup.test.js`.
- Verified the masthead no longer renders `Admin access`.
- Verified the login screen keeps the same routing and utility behavior after the masthead cleanup.

## Browser proof

- Disposable preview server: `http://127.0.0.1:3374`
- Reason: the long-running `http://127.0.0.1:3360` instance was still serving an older build during verification.
- Screenshot:
  - `output/playwright/login-brand-normalized.png`
