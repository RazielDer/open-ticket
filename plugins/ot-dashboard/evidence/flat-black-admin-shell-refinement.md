# Flat Black Admin Shell Refinement

## Intent

Reduce the remaining charcoal-gray layering and tinted chrome in the authenticated admin shell so the dashboard feels closer to a true flat-black theme.

## Changes applied

- Rebased the shared surface palette onto flatter black neutrals instead of medium-charcoal layers.
- Reduced border intensity, status-strip tinting, utility-box contrast, and button chrome to match the plain dark login direction.
- Removed leftover card and footer lift so the authenticated shell reads calmer without changing the existing layout.
- Corrected the mature-home regression test fixture so a healthy transcript bridge is represented as actually ready.

## Verification completed

- `npm run build`
- `node --test dist/plugins/ot-dashboard/test/app.test.js dist/plugins/ot-dashboard/test/auth.test.js dist/plugins/ot-dashboard/test/home-setup.test.js`

## Browser proof

- Disposable preview: `http://127.0.0.1:3378`
- Login screenshot: `output/playwright/login-flat-black-preview.png`
- Admin screenshot: `output/playwright/admin-home-flat-black-preview.png`
