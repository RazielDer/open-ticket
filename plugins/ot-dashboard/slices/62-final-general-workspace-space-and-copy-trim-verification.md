# Slice 62: Final General Workspace Space And Copy Trim Verification

## Goal

Verify the General workspace trim pass end to end with full tests and authenticated desktop/mobile browser checks.

## Verification

```bash
npm run build
node --test dist/plugins/ot-dashboard/test/app.test.js dist/plugins/ot-dashboard/test/auth.test.js dist/plugins/ot-dashboard/test/home-setup.test.js dist/plugins/ot-dashboard/test/editor-layout.test.js dist/plugins/ot-dashboard/test/operational-pages.test.js dist/plugins/ot-dashboard/test/transcript-workspace.test.js
```

Authenticated browser checks:

- `http://127.0.0.1:3371/dash/visual/general` at `1440x900`
- `http://127.0.0.1:3371/dash/visual/general` at `390x844`
