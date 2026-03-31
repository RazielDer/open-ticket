# Entry-Surface Simplification

## Intent

Apply a smaller, calmer public entry system to OT Dashboard after the broader dark graphite refactor shipped.

## Locked direction

- Minimal gateway instead of feature overview
- Shared landing/login grammar
- One dominant action
- Health kept as a secondary utility
- Neutral dark surfaces with restrained accent use

## Verification target

- `npm run build`
- `node --test dist/plugins/ot-dashboard/test/app.test.js dist/plugins/ot-dashboard/test/auth.test.js dist/plugins/ot-dashboard/test/home-setup.test.js`

## Outcome

- The landing page now uses one primary action, one subdued utility action, and one support block instead of repeated card stacks.
- The login page now keeps the password form as the focal point and collapses the prior three-card explainer into one lower-emphasis support section.
- Public entry pages use a flatter neutral dark background and reduced accent intensity without changing dashboard auth or routing behavior.

## Final verification

- PASS `npm run build`
- PASS `node --test dist/plugins/ot-dashboard/test/app.test.js dist/plugins/ot-dashboard/test/auth.test.js dist/plugins/ot-dashboard/test/home-setup.test.js`
- PASS browser preview capture from a disposable local dashboard instance
  - `output/playwright/landing.png`
  - `output/playwright/login.png`
