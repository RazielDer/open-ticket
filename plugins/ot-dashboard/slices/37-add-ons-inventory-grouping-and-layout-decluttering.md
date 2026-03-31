# Slice 37: Add-ons Inventory Grouping And Layout Decluttering

## Objective

Break `/admin/plugins` out of the single mixed wall by grouping add-ons around operational state and tightening the section scan path.

## Exact files

- `plugins/ot-dashboard/public/global.css`
- `plugins/ot-dashboard/public/views/sections/plugins.ejs`
- `plugins/ot-dashboard/public/js/control-center.js`
- `plugins/ot-dashboard/server/control-center.ts`
- `plugins/ot-dashboard/locales/english.json`
- `plugins/ot-dashboard/test/app.test.ts`
- `plugins/ot-dashboard/test/operational-pages.test.ts`

## Locked implementation decisions

- Keep the search behavior client-side and progressive; do not add a backend filter API.
- Group by operational state rather than creator or author.
- Keep `/admin/plugins/:id` and manifest export actions unchanged and reachable from every item.
- Keep the matte, shadow-free shell direction already established by the login/admin surfaces.

## Required changes

- Replace the single undifferentiated inventory wall with grouped sections keyed by add-on state.
- Add compact group headings/counts so operators can scan the whole inventory faster without reading every card.
- Update client-side filtering so empty groups hide cleanly while the filtered empty state still appears when nothing matches.
- Keep the grouped layout calm on both desktop and stacked/mobile widths.

## Verification for this slice

```bash
npm run build
node --test dist/plugins/ot-dashboard/test/app.test.js dist/plugins/ot-dashboard/test/operational-pages.test.js
```
