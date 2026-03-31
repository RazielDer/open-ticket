# Shared Editor Workspace Foundation

## Intent

Establish the shared editor shell and advanced-tools parity contract for `General`, `Options`, `Panels`, and `Questions` before any Home or legacy-route cutover.

## Changes applied

- Added shared workspace header and advanced-tools partials for the in-scope visual editors.
- Introduced shared workspace CSS primitives for the matte split layout, sticky sidebar, restore list, and sticky save region.
- Passed raw/export/review/backup/restore payloads from the page routes into `General`, `Options`, `Panels`, and `Questions`.
- Moved the four visual pages onto the new shell while keeping the existing editor behavior intact for later slice-specific redesign work.
- Kept Home setup cards and `/admin/configs/:id` detail routes unchanged in this slice.

## Verification completed

- `npm run build`
- `node --test dist/plugins/ot-dashboard/test/editor-layout.test.js dist/plugins/ot-dashboard/test/app.test.js`

## Behavior evidence

- `/dash/visual/general` now renders `Workspace navigation`, `Advanced tools`, `/dash/admin/configs/general/review`, and `/dash/admin/configs/general/export`.
- `/dash/visual/options`, `/dash/visual/panels`, and `/dash/visual/questions` now render the same advanced-tools tray without changing their save endpoints.
- The raw JSON routes at `/dash/config/:id` and the legacy `/dash/admin/configs/:id` detail routes remain available.
