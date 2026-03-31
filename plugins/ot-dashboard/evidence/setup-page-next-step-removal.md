# Setup Page Next Step Removal

## Intent

Safely delete the redundant `Next step` card from `/admin/configs` so the Setup page stays focused on setup work instead of pointing away to daily operations.

## Changes applied

- Deleted the `Next step` section from the Setup-page template.
- Removed the Setup-route `recommendedAction` wiring that only existed for that deleted section.
- Narrowed the Setup-page workspace model so it no longer exposes the deleted page-only field.

## Verification completed

- `npm run build`
- `node --test dist/plugins/ot-dashboard/test/app.test.js dist/plugins/ot-dashboard/test/auth.test.js dist/plugins/ot-dashboard/test/home-setup.test.js`

## Browser proof

- Disposable preview: `http://127.0.0.1:3382`
- Setup screenshot: `output/playwright/setup-page-next-step-removed.png`
