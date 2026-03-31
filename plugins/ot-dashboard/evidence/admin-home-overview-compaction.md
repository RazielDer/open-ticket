# Admin Home Overview Compaction

## Intent

Remove the remaining inflated status and footer slabs on `/admin` without changing the current flat-black theme, navigation, or setup flow.

## Changes applied

- Moved the home status strip into the overview stage so it reads as part of the same dashboard-summary moment as the headline and metrics.
- Stopped the admin shell grid from stretching rows across the viewport, which removed the oversized empty status and footer bands.
- Tightened overview and footer spacing so the page begins and ends closer to the actual content.

## Verification completed

- `npm run build`
- `node --test dist/plugins/ot-dashboard/test/app.test.js dist/plugins/ot-dashboard/test/auth.test.js dist/plugins/ot-dashboard/test/home-setup.test.js`

## Browser proof

- Disposable preview: `http://127.0.0.1:3381`
- Admin screenshot: `output/playwright/admin-home-overview-compaction.png`
