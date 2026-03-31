# Slice 53: General Workspace Structure And Density Rebalance

## Objective

Refine `/visual/general` so it stops reading like a clustered single-column stack, uses desktop width better, and reaches the main form more cleanly on mobile.

## Exact files

- `plugins/ot-dashboard/public/views/config-general.ejs`
- `plugins/ot-dashboard/public/global.css`
- `plugins/ot-dashboard/locales/english.json`
- `plugins/ot-dashboard/test/editor-layout.test.ts`

## Locked implementation decisions

- Keep the existing Express + EJS architecture and the current General save route and field names.
- Stay matte, dark, and glow-free, using `/login` as the visual reference.
- Preserve raw JSON, export, backup, review, and restore reachability through the advanced-tools tray.
- Keep the pass structural and page-specific instead of reopening the wider shared editor model.

## Required changes

- Replace the ambiguous General header stat language with a clearer workspace-specific label.
- Tighten the General navigation copy and mobile navigation density so the form starts sooner on stacked layouts.
- Rebalance the General form sections so desktop uses the editor lane more efficiently, including a paired logs/limits row.
- Turn the General advanced section into a calmer disclosure grid instead of one long repeated stack.
- Remove the General save-bar overlap so the page ends with a deliberate commit row.
- Update route/layout tests to assert the new General-specific structure hooks.

## Verification for this slice

```bash
npm run build
node --test dist/plugins/ot-dashboard/test/editor-layout.test.js dist/plugins/ot-dashboard/test/operational-pages.test.js
```
