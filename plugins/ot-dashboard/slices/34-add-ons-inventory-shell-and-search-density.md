# Slice 34: Add-ons Inventory Shell And Search Density

## Objective

Tighten the `/admin/plugins` shell so the page intro, section framing, and search control feel calmer, narrower, and closer to the login reference.

## Exact files

- `plugins/ot-dashboard/public/global.css`
- `plugins/ot-dashboard/public/views/admin-shell.ejs`
- `plugins/ot-dashboard/public/views/sections/plugins.ejs`
- `plugins/ot-dashboard/public/js/control-center.js`
- `plugins/ot-dashboard/server/control-center.ts`
- `plugins/ot-dashboard/server/routes/admin.ts`
- `plugins/ot-dashboard/locales/english.json`
- `plugins/ot-dashboard/test/app.test.ts`
- `plugins/ot-dashboard/test/operational-pages.test.ts`

## Locked implementation decisions

- Keep `/admin/plugins` inside the existing admin shell rather than creating a new route family.
- Add only the minimum shared-shell hook needed to scope layout refinements to the add-ons inventory page.
- Keep the search behavior client-side and progressive; do not introduce a new backend filter API.
- Remove duplicated visible heading structure before changing deeper card content.

## Required changes

- Add a scoped page class or equivalent hook so `/admin/plugins` can use tighter intro and content-width rules without regressing other admin pages.
- Rebuild the inventory section header so the search input sits in the primary toolbar without spending a full extra row on repeated labeling.
- Add an in-page filtered-empty state so searching does not leave the user staring at a blank grid.
- Keep the shell matte, shadow-free, and consistent with `/login`.

## Verification for this slice

```bash
npm run build
node --test dist/plugins/ot-dashboard/test/app.test.js dist/plugins/ot-dashboard/test/operational-pages.test.js
```
