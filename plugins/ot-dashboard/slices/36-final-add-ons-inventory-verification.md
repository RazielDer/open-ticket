# Slice 36: Final Add-ons Inventory Verification

## Objective

Finish the `/admin/plugins` refinement pass with the minimum final polish needed after slices 34 and 35, then run the full verification set and capture completion evidence.

## Exact files

- `plugins/ot-dashboard/public/global.css`
- `plugins/ot-dashboard/public/views/admin-shell.ejs`
- `plugins/ot-dashboard/public/views/sections/plugins.ejs`
- `plugins/ot-dashboard/public/js/control-center.js`
- `plugins/ot-dashboard/locales/english.json`
- `plugins/ot-dashboard/server/control-center.ts`
- `plugins/ot-dashboard/server/routes/admin.ts`
- `plugins/ot-dashboard/test/app.test.ts`
- `plugins/ot-dashboard/test/auth.test.ts`
- `plugins/ot-dashboard/test/home-setup.test.ts`
- `plugins/ot-dashboard/test/operational-pages.test.ts`

## Locked implementation decisions

- Keep scope centered on the add-ons inventory and any narrow shared-shell hooks it needs.
- Preserve auth, CSRF, plugin detail/workbench reachability, manifest export reachability, and the existing admin navigation structure.
- Capture exact command results and browser/manual outcomes in the evidence note.

## Required changes

- Apply only the minimum final polish needed after slices 34 and 35.
- Run the full verification set.
- Repeat desktop/mobile browser checks on `/admin/plugins` and capture the meaningful outcomes.
- Update the controller-kernel artifacts and add the matching completion evidence note for this follow-up pass.

## Final verification for this slice

```bash
npm run build
node --test dist/plugins/ot-dashboard/test/app.test.js dist/plugins/ot-dashboard/test/auth.test.js dist/plugins/ot-dashboard/test/home-setup.test.js dist/plugins/ot-dashboard/test/operational-pages.test.js
```

## Required browser/manual checks

- `/dash/admin/plugins`

At `1440x900` and `390x844`, verify:

- the intro/header stack is tighter and calmer than the prior admin-shell baseline
- the search control is reachable without a repeated label row
- the grid feels narrower and more deliberate relative to `/login`
- cards surface useful JSON/file context without becoming taller than before
- filtered empty-state behavior works
- status, tags, and actions remain legible and reachable
