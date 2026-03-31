# Slice 35: Add-ons Card Hierarchy And Copy Refinement

## Objective

Refine the `/admin/plugins` inventory cards so status, useful facts, JSON reachability, and actions read clearly without the current metadata bloat.

## Exact files

- `plugins/ot-dashboard/public/global.css`
- `plugins/ot-dashboard/public/views/sections/plugins.ejs`
- `plugins/ot-dashboard/locales/english.json`
- `plugins/ot-dashboard/server/control-center.ts`
- `plugins/ot-dashboard/test/app.test.ts`
- `plugins/ot-dashboard/test/operational-pages.test.ts`

## Locked implementation decisions

- Keep the current `Open add-on` and manifest export routes and labels reachable.
- Prefer denser card structure and better surfaced existing data over adding new plugin model fields unless the template needs a small computed helper.
- Use existing inventory data such as `assetPreview`, tags, and status instead of inventing new summaries.
- Keep copy conservative and operator-facing; avoid marketing language.

## Required changes

- Tighten the add-on cards so they read as denser workbench launchers rather than generic catalog tiles.
- Surface the existing JSON preview data so users can tell which add-ons expose editable files before opening the workbench.
- Shorten or reorganize repeated helper/meta copy where it is inflating the inventory without adding new meaning.
- Keep tags, status, and action affordances legible on both desktop and stacked/mobile layouts.

## Verification for this slice

```bash
npm run build
node --test dist/plugins/ot-dashboard/test/app.test.js dist/plugins/ot-dashboard/test/operational-pages.test.js
```
