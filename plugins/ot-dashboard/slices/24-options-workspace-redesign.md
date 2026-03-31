# Slice 24: Options Workspace Redesign

## Objective

Rebuild `/visual/options` into a dedicated inventory-plus-editor workspace with structured assignment, duplicate, reorder, and dependency guidance.

## Exact files

- `plugins/ot-dashboard/public/views/config-options.ejs`
- `plugins/ot-dashboard/public/js/config-options.js`
- `plugins/ot-dashboard/server/routes/pages.ts`
- `plugins/ot-dashboard/locales/english.json`
- `plugins/ot-dashboard/test/editor-layout.test.ts`
- `plugins/ot-dashboard/test/app.test.ts`

## Locked implementation decisions

- Remove modal-first editing from `Options`.
- Use a dedicated inventory rail and main editor surface.
- Question assignment must use a structured picker, not raw JSON textareas.
- Show inline dependency context:
  - assigned questions
  - referencing panels
- Duplicate-as-new and reorder are required in this slice.
- Raw JSON remains in advanced tools only.

## Required changes

- Replace the modal shell with the shared workspace structure.
- Add structured creation/edit flow for ticket, website, and role options.
- Wire duplicate, delete, reorder, and dependency-warning UX to the locked backend contracts.
- Keep current save payload shape for `POST /api/options/save`.

## Verification for this slice

```bash
npm run build
node --test dist/plugins/ot-dashboard/test/editor-layout.test.js dist/plugins/ot-dashboard/test/app.test.js
```
