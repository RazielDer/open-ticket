# Slice 22: General Workspace Redesign

## Objective

Convert `/visual/general` into the new shared workspace format while keeping the current POST target and submitted field names unchanged.

## Exact files

- `plugins/ot-dashboard/public/views/config-general.ejs`
- `plugins/ot-dashboard/public/global.css`
- `plugins/ot-dashboard/server/routes/pages.ts`
- `plugins/ot-dashboard/locales/english.json`
- `plugins/ot-dashboard/test/editor-layout.test.ts`
- `plugins/ot-dashboard/test/app.test.ts`

## Locked implementation decisions

- `General` remains a full-page form, not an inventory editor.
- Common operator sections stay open; rare flags and expert controls move into collapsed advanced sections.
- Raw JSON remains in the advanced-tools tray, not as a peer hero action.
- Keep all current `name=` form fields and `POST /api/config/general` unchanged.

## Required changes

- Add compact section navigation inside the workspace.
- Re-group the form into operator-facing sections:
  - connection and command mode
  - status
  - logs
  - limits
  - advanced behavior
- Keep save feedback and focus states aligned with the new workspace shell.

## Verification for this slice

```bash
npm run build
node --test dist/plugins/ot-dashboard/test/editor-layout.test.js dist/plugins/ot-dashboard/test/app.test.js
```
