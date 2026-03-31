# Slice 25: Panels Workspace Redesign

## Objective

Rebuild `/visual/panels` into a dedicated inventory-plus-editor workspace with structured option picking, in-page summary preview, duplicate, and reorder support.

## Exact files

- `plugins/ot-dashboard/public/views/config-panels.ejs`
- `plugins/ot-dashboard/public/js/config-panels.js`
- `plugins/ot-dashboard/server/routes/pages.ts`
- `plugins/ot-dashboard/locales/english.json`
- `plugins/ot-dashboard/test/editor-layout.test.ts`
- `plugins/ot-dashboard/test/app.test.ts`

## Locked implementation decisions

- Remove modal-first editing from `Panels`.
- Replace the raw option-ID textarea with a structured option picker using available-option metadata.
- Keep dropdown compatibility guidance in-page before save.
- Add structured summary preview for:
  - dropdown vs button mode
  - selected options
  - member-facing text/embed summary
- Duplicate-as-new and reorder are required in this slice.

## Required changes

- Replace the modal shell with the shared workspace structure.
- Surface panel settings in clear sections instead of one hidden modal form.
- Wire duplicate, delete, reorder, and validation feedback to the locked save contracts.
- Keep current save payload shape for `POST /api/panels/save`.

## Verification for this slice

```bash
npm run build
node --test dist/plugins/ot-dashboard/test/editor-layout.test.js dist/plugins/ot-dashboard/test/app.test.js
```
