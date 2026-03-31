# Admin Home Daily Work Removal

## Intent

Remove the redundant `Daily work` section from the admin home so the page says less and relies on the existing rail plus setup controls for navigation.

## Changes applied

- Deleted the `Daily work` section from the home overview template.
- Removed the now-unused home-model route payload that existed only to populate that section.
- Tightened the home subtitle so the page no longer refers to a removed content band.
- Updated admin-home tests to assert that the repeated section and repeated action copy are gone.

## Verification completed

- `npm run build`
- `node --test dist/plugins/ot-dashboard/test/app.test.js dist/plugins/ot-dashboard/test/auth.test.js dist/plugins/ot-dashboard/test/home-setup.test.js`

## Browser proof

- Disposable preview: `http://127.0.0.1:3379`
- Admin screenshot: `output/playwright/admin-home-daily-work-removed.png`
