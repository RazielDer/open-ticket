# Panels Workspace Redesign

## Intent

Convert `/visual/panels` from a modal-first tool into a dedicated inventory-plus-editor workspace with structured option picking and member-preview feedback.

## Changes applied

- Replaced the panel modal flow with a persistent editor surface and inventory rail.
- Replaced the raw option-ID textarea with a structured option picker backed by the available-option metadata.
- Added duplicate, delete, and reorder controls that reuse the locked panel save and reorder endpoints.
- Kept dropdown compatibility guidance visible in the workspace before save.
- Added an in-page preview section for selected options, member-facing text, embed summary, and dropdown placeholder state.
- Updated app and layout tests to prove the modal launcher is gone and the structured option picker is present.

## Verification completed

- `npm run build`
- `node --test dist/plugins/ot-dashboard/test/editor-layout.test.js dist/plugins/ot-dashboard/test/app.test.js`

## Behavior evidence

- `/dash/visual/panels` now renders `Structured option picker`, `Panel preview`, `Duplicate as new`, and reorder controls directly in the workspace.
- The panels editor still submits to `/dash/api/panels/save` with the existing payload shape while using `/dash/api/panels/reorder` and `/dash/api/panels/delete/:index` for inventory actions.
- The advanced-tools tray still exposes `/dash/admin/configs/panels/review`, `/dash/admin/configs/panels/export`, backups, restore, and `/dash/config/panels`.
