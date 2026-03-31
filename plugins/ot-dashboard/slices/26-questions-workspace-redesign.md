# Slice 26: Questions Workspace Redesign

## Objective

Rebuild `/visual/questions` into a dedicated inventory-plus-editor workspace with usage summaries, duplicate, and reorder support.

## Exact files

- `plugins/ot-dashboard/public/views/config-questions.ejs`
- `plugins/ot-dashboard/public/js/config-questions.js`
- `plugins/ot-dashboard/server/routes/pages.ts`
- `plugins/ot-dashboard/locales/english.json`
- `plugins/ot-dashboard/test/editor-layout.test.ts`
- `plugins/ot-dashboard/test/app.test.ts`

## Locked implementation decisions

- Remove modal-first editing from `Questions`.
- Use the shared workspace structure with inventory plus main editor.
- Show inline usage summaries for options that consume the selected question.
- Duplicate-as-new and reorder are required in this slice.
- Question delete and ID change must honor the slice-23 reference guards.

## Required changes

- Replace the modal shell with the shared workspace structure.
- Keep the editor focused on ID, label, type, required state, placeholder, and length validation.
- Surface dependency guidance before blocked save/delete actions occur.
- Keep current save payload shape for `POST /api/questions/save`.

## Verification for this slice

```bash
npm run build
node --test dist/plugins/ot-dashboard/test/editor-layout.test.js dist/plugins/ot-dashboard/test/app.test.js
```
