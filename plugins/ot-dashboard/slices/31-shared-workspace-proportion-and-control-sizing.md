# Slice 31: Shared Workspace Proportion And Control Sizing

## Objective

Tighten the shared workspace shell so the four core editors feel better proportioned on desktop and less vertically wasteful on stacked/mobile layouts.

## Exact files

- `plugins/ot-dashboard/public/global.css`
- `plugins/ot-dashboard/public/views/partials/editor-workspace-header.ejs`
- `plugins/ot-dashboard/public/views/partials/editor-advanced-tools.ejs`
- `plugins/ot-dashboard/public/views/config-general.ejs`
- `plugins/ot-dashboard/public/views/config-options.ejs`
- `plugins/ot-dashboard/public/views/config-panels.ejs`
- `plugins/ot-dashboard/public/views/config-questions.ejs`
- `plugins/ot-dashboard/test/editor-layout.test.ts`
- `plugins/ot-dashboard/test/app.test.ts`

## Locked implementation decisions

- Keep the existing shared workspace model and advanced-tools disclosure model.
- Reduce the shared page width and sidebar footprint only enough to improve balance; do not create a new layout pattern.
- Shorten the shared header, stat cards, inventory rows, and save bar before changing deeper form structure.
- On stacked/mobile widths, keep the inventory visible and the advanced-tools tray collapsed by default.
- Replace the current all-buttons-full-width mobile toolbar behavior with a denser grouped action layout for the editor toolbars while keeping buttons reachable and labeled.

## Required changes

- Tighten shared workspace width, sidebar column size, shared header padding, stat-card padding, and related typography so the top shell reads calmer on desktop.
- Reduce the vertical size of inventory rows, summary cards, and save bars without weakening affordance or readability.
- Add scoped mobile treatment for editor action clusters so duplicate/move/delete controls no longer become a four-row stack before the first form fields.
- Keep raw JSON, export, backup, review, and restore reachable and visually consistent with the tighter shell.

## Verification for this slice

```bash
npm run build
node --test dist/plugins/ot-dashboard/test/editor-layout.test.js dist/plugins/ot-dashboard/test/app.test.js
```
