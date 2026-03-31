# Admin Home Density Refinement

## Intent

Make the top of `/admin` feel denser and less padded by consolidating the intro and summary into one clearer workspace block.

## Changes applied

- Consolidated the home intro and summary metrics into a single top workspace block for `/admin`.
- Reduced admin-shell spacing and padding around the status strip, sections, cards, and footer.
- Preserved the flat-black theme and existing navigation/setup flow while removing shallow stacked framing.

## Verification completed

- `npm run build`
- `node --test dist/plugins/ot-dashboard/test/app.test.js dist/plugins/ot-dashboard/test/auth.test.js dist/plugins/ot-dashboard/test/home-setup.test.js`

## Browser proof

- Disposable preview: `http://127.0.0.1:3380`
- Admin screenshot: `output/playwright/admin-home-density-refined.png`
