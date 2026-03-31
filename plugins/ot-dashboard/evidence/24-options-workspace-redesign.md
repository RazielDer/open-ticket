# Options Workspace Redesign

## Intent

Convert `/visual/options` from a modal-first tool into a dedicated inventory-plus-editor workspace with structured question assignment and dependency-aware actions.

## Changes applied

- Replaced the modal entry flow with a persistent editor surface and inventory rail for option selection.
- Added inline duplicate, delete, and reorder controls that reuse the locked options API routes.
- Replaced the raw question-ID textarea with a structured reusable-question picker for ticket options.
- Kept panel-reference warnings visible in the workspace so blocked ID changes and deletes are explained before the API rejects them.
- Preserved the existing advanced-tools tray so raw review, export, backup, restore, and raw JSON access remain reachable.
- Updated app and layout tests to prove the modal launcher is gone and the structured question picker is present.

## Verification completed

- `npm run build`
- `node --test dist/plugins/ot-dashboard/test/editor-layout.test.js dist/plugins/ot-dashboard/test/app.test.js`

## Behavior evidence

- `/dash/visual/options` now renders `Question assignment`, `Assigned questions`, `Duplicate as new`, and reorder controls directly in the workspace.
- The options editor still submits to `/dash/api/options/save` with the existing payload shape while using the new reorder and delete endpoints for inventory actions.
- The advanced-tools tray still exposes `/dash/admin/configs/options/review`, `/dash/admin/configs/options/export`, backups, restore, and `/dash/config/options`.
