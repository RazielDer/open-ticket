# Add-ons Inventory UI Refinement Planning

## Intent

Prepare a focused follow-up pass for `/admin/plugins` so the add-ons inventory reads like a primary matte-black workspace instead of a generic admin listing, while keeping the existing route, auth, manifest export, and plugin workbench flows intact.

## Repo-grounded findings

- The live `http://127.0.0.1:3360/admin/plugins` route redirects to `/login?returnTo=%2Fadmin%2Fplugins`, so the current `/login` surface is still the right visual reference for the follow-up.
- An authenticated fixture browser audit of `/dash/admin/plugins` at `1440x900` showed the add-ons page still uses the older admin-shell pattern: a tall `page-intro` slab, a second section heading that repeats the page subject, and a loose card grid that stretches broader than the restrained login card.
- The inventory search control currently spends a full row on a visible label before the input, which adds vertical weight without improving scan speed.
- Each add-on card repeats the same three metadata blocks (`Source`, `Authors`, `JSON files`) using stacked label/value rows, which makes the grid feel heavy while still hiding the most useful operator detail: which editable JSON files are actually present.
- The inventory route already computes `assetPreview` values in `buildPluginInventoryItems`, but the template does not surface them, so users still need to open a workbench before they can tell whether a plugin exposes relevant JSON files.
- The page currently keeps the warm accent and matte shell direction, so the work should tighten hierarchy and proportion without adding glow, blur, elevated shadows, or glossy gradients.

## Locked decisions

- Keep the scope inside `plugins/ot-dashboard/**`.
- Keep the existing Express + EJS architecture and the `/admin/plugins` and `/admin/plugins/:id` routes unchanged.
- Preserve auth, CSRF, plugin detail routes, manifest export reachability, backup reachability, and plugin JSON workbench behavior.
- Use `/login` as the visual reference surface for spacing, restraint, and matte-black tone.
- Treat this as a layout and content-hierarchy follow-up, not a feature pass: tighten proportions, expose more useful inventory context, and simplify repeated copy.
- Allow narrow shared-shell hooks only when they are required to target `/admin/plugins` without regressing the rest of the admin surfaces.

## Slice map

1. `34-add-ons-inventory-shell-and-search-density`
   - Tighten the inventory page intro, section shell, width, and search-toolbar structure so the page matches the login reference more closely.
2. `35-add-ons-card-hierarchy-and-copy-refinement`
   - Rebuild the inventory cards around denser status, facts, JSON-preview, and action hierarchy while keeping the existing routes and labels reachable.
3. `36-final-add-ons-inventory-verification`
   - Run build, targeted tests, and desktop/mobile browser checks for the add-ons inventory, then capture the completion evidence.

## Verification contract

- Slice verification:
  - `npm run build`
  - `node --test dist/plugins/ot-dashboard/test/app.test.js dist/plugins/ot-dashboard/test/operational-pages.test.js`
- Final verification:
  - `npm run build`
  - `node --test dist/plugins/ot-dashboard/test/app.test.js dist/plugins/ot-dashboard/test/auth.test.js dist/plugins/ot-dashboard/test/home-setup.test.js dist/plugins/ot-dashboard/test/operational-pages.test.js`
  - Browser/manual checks on `/dash/admin/plugins` at `1440x900` and `390x844`
