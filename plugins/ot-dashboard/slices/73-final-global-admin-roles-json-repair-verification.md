# Slice 73: Final Global Admin Roles JSON Repair Verification

## Objective

Verify the Global Admin Roles JSON repair chain end to end with the full dashboard node suite plus desktop/mobile General-page behavior checks.

## Verification

```bash
npm run build
node --test dist/plugins/ot-dashboard/test/app.test.js dist/plugins/ot-dashboard/test/auth.test.js dist/plugins/ot-dashboard/test/home-setup.test.js dist/plugins/ot-dashboard/test/editor-layout.test.js dist/plugins/ot-dashboard/test/operational-pages.test.js dist/plugins/ot-dashboard/test/viewer-routes.test.js dist/plugins/ot-dashboard/test/transcript-workspace.test.js dist/plugins/ot-dashboard/test/roundtrip.test.js
```

Browser/manual checks:

- `http://127.0.0.1:3360/dash/visual/general` at `1440x900` and `390x844`, or the equivalent local fixture route when the live dashboard is unavailable
- One valid save using a JSON array of quoted role IDs
- One invalid save using a trailing-comma JSON array to confirm inline error, preserved draft state, and no write
- One legacy-corrupted saved value to confirm repaired display plus warning, then successful clean rewrite on save
- One quick regression pass confirming Security multiline lists and Options list editors still behave as before
