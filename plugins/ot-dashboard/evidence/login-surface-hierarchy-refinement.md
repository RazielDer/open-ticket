# Login Surface Hierarchy Refinement

## Intent

Polish the existing login-first entry so it reads as a premium, restrained dark-mode access screen instead of a narrow card in empty space.

## Locked direction

- Card placement should feel anchored and slightly elevated
- Brand hierarchy should be strong without hyperlink-like underline styling
- `Health` should stay local to the card but read as a utility
- No empty inline status box before interaction

## Verification target

- `npm run build`
- `node --test dist/plugins/ot-dashboard/test/app.test.js dist/plugins/ot-dashboard/test/auth.test.js dist/plugins/ot-dashboard/test/home-setup.test.js`

## Results

- Passed `npm run build`.
- Passed `node --test dist/plugins/ot-dashboard/test/app.test.js dist/plugins/ot-dashboard/test/auth.test.js dist/plugins/ot-dashboard/test/home-setup.test.js`.
- Verified the login page no longer reserves a blank status box before interaction.
- Verified `Check health` updates inline status text inside the card instead of navigating away.

## Browser proof

- Disposable preview server: `http://127.0.0.1:3372`
- Reason: the long-running `http://127.0.0.1:3360` instance was still serving an older build during verification.
- Screenshots:
  - `output/playwright/login-refined.png`
  - `output/playwright/login-refined-health.png`
