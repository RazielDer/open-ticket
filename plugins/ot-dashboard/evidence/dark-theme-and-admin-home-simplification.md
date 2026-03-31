# Dark Theme And Admin Home Simplification

## Intent

Shift the shared OT Dashboard UI toward a plain matte dark theme and simplify the `/admin` home page so operators see one clear status picture and one clear next step.

## Locked direction

- No decorative glow on the login surface
- Shared admin shell follows the same restrained dark theme
- Home flow removes redundant copy and repeated status storytelling

## Verification target

- `npm run build`
- `node --test dist/plugins/ot-dashboard/test/app.test.js dist/plugins/ot-dashboard/test/auth.test.js dist/plugins/ot-dashboard/test/home-setup.test.js`

## Verification results

- `npm run build` passed.
- `node --test dist/plugins/ot-dashboard/test/app.test.js dist/plugins/ot-dashboard/test/auth.test.js dist/plugins/ot-dashboard/test/home-setup.test.js` passed.

## Browser evidence

- Current-code login preview: `output/playwright/login-plain-dark-preview.png`
- Current-code admin home preview: `output/playwright/admin-home-final-preview.png`
- Disposable verification preview ran on `http://127.0.0.1:3377`.

## Notes

- The long-running dashboard instance on `http://127.0.0.1:3360` was still serving an older build during verification.
- The current code preview confirms the login surface is flat and plain-dark, and the admin home now prioritizes daily work before setup details when the setup state is already complete enough for normal operations.
