# Slice 39: Final Add-ons Decluttering Verification

## Objective

Finish the `/admin/plugins` decluttering follow-up with the minimum final polish needed after slices 37 and 38, then run the full verification set and capture completion evidence.

## Exact files

- `plugins/ot-dashboard/public/global.css`
- `plugins/ot-dashboard/public/views/sections/plugins.ejs`
- `plugins/ot-dashboard/public/js/control-center.js`
- `plugins/ot-dashboard/server/control-center.ts`
- `plugins/ot-dashboard/locales/english.json`
- `plugins/ot-dashboard/test/app.test.ts`
- `plugins/ot-dashboard/test/auth.test.ts`
- `plugins/ot-dashboard/test/home-setup.test.ts`
- `plugins/ot-dashboard/test/editor-layout.test.ts`
- `plugins/ot-dashboard/test/operational-pages.test.ts`

## Locked implementation decisions

- Keep scope centered on the add-ons inventory and any narrow shared-shell hooks it needs.
- Preserve auth, CSRF, plugin detail/workbench reachability, manifest export reachability, and the existing admin navigation structure.
- Capture exact command results and browser/manual outcomes in the evidence note.

## Required changes

- Apply only the minimum final polish needed after slices 37 and 38.
- Run the full verification set.
- Repeat desktop/mobile browser checks on `/admin/plugins` and capture the meaningful outcomes.
- Update the controller-kernel artifacts and add the matching completion evidence note for this follow-up pass.

## Final verification for this slice

```bash
npm run build
node --test dist/plugins/ot-dashboard/test/app.test.js dist/plugins/ot-dashboard/test/auth.test.js dist/plugins/ot-dashboard/test/home-setup.test.js dist/plugins/ot-dashboard/test/editor-layout.test.js dist/plugins/ot-dashboard/test/operational-pages.test.js
```

## Required browser/manual checks

- `/dash/admin/plugins`

At `1440x900` and `390x844`, verify:

- the grouped inventory reads calmer than the prior single-wall grid
- search hides empty groups cleanly and still exposes the filtered empty state
- the main item structure feels flatter and less boxed
- redundant metadata is reduced without hiding authors, JSON preview, or actions
- the shell remains matte, shadow-free, and visually aligned with `/login`
