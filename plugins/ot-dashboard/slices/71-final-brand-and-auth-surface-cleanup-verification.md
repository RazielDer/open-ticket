# Slice 71: Final Brand And Auth Surface Cleanup Verification

## Objective

Verify the dashboard brand/auth cleanup end to end with the full node test suite plus browser checks on the admin login, viewer login, and shared dashboard chrome.

## Verification

```bash
npm run build
node --test dist/plugins/ot-dashboard/test/app.test.js dist/plugins/ot-dashboard/test/auth.test.js dist/plugins/ot-dashboard/test/home-setup.test.js dist/plugins/ot-dashboard/test/editor-layout.test.js dist/plugins/ot-dashboard/test/operational-pages.test.js dist/plugins/ot-dashboard/test/viewer-routes.test.js dist/plugins/ot-dashboard/test/transcript-workspace.test.js
```

Browser/manual checks:

- `http://127.0.0.1:3360/login` at `1440x900` and `390x844`, or the equivalent local fixture route when the live dashboard is unavailable to automation
- `http://127.0.0.1:3360/transcripts/_auth/login` at `1440x900` and `390x844`, or the equivalent local fixture route when the live dashboard is unavailable to automation
- One authenticated admin-shell route and one viewer-portal route to confirm there is no visible footer or visible health shortcut regression outside the auth pages
- Hard refresh or incognito favicon check to confirm the browser tab shows the new dinosaur favicon instead of the cached E4 icon
