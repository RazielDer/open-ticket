# Questions Workspace Redesign

## Intent

Convert `/visual/questions` from a modal-first tool into a dedicated inventory-plus-editor workspace with visible option-usage summaries.

## Changes applied

- Replaced the question modal flow with a persistent editor surface and inventory rail.
- Added duplicate, delete, and reorder controls that reuse the locked question save and reorder endpoints.
- Added visible usage summaries so option references stay visible while a question is edited.
- Kept rename/delete warning guidance in the workspace for questions that are still referenced by options.
- Preserved the advanced-tools tray so raw review, export, backup, restore, and raw JSON access remain reachable.
- Updated app and layout tests to prove the modal launcher is gone and the usage-summary surface is present.

## Verification completed

- `npm run build`
- `node --test dist/plugins/ot-dashboard/test/editor-layout.test.js dist/plugins/ot-dashboard/test/app.test.js`

## Behavior evidence

- `/dash/visual/questions` now renders `Usage summary`, `Referenced by options`, `Duplicate as new`, and reorder controls directly in the workspace.
- The questions editor still submits to `/dash/api/questions/save` with the existing payload shape while using `/dash/api/questions/reorder` and `/dash/api/questions/delete/:index` for inventory actions.
- The advanced-tools tray still exposes `/dash/admin/configs/questions/review`, `/dash/admin/configs/questions/export`, backups, restore, and `/dash/config/questions`.
