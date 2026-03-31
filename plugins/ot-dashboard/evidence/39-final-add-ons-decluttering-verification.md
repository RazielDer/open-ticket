# Slice 39 Evidence: Final Add-ons Decluttering Verification

## Summary

- Removed the last duplicated inventory-count line so `/admin/plugins` now presents one restrained add-ons surface instead of stacked intro and summary layers.
- Closed the decluttering follow-up with grouped flat rows, trimmed metadata, inline actions, and a tighter mobile admin rail while preserving auth, CSRF, workbench reachability, manifest export, and the existing admin navigation structure.
- Verified the final render against the authenticated fixture runtime because `127.0.0.1:3360` remained unavailable from the automation environment during this pass.

## Commands run

```bash
npm run build
node --test dist/plugins/ot-dashboard/test/app.test.js dist/plugins/ot-dashboard/test/auth.test.js dist/plugins/ot-dashboard/test/home-setup.test.js dist/plugins/ot-dashboard/test/editor-layout.test.js dist/plugins/ot-dashboard/test/operational-pages.test.js
```

## Meaningful outcomes

- `npm run build` succeeded with `OT: Compilation Succeeded!`
- `node --test dist/plugins/ot-dashboard/test/app.test.js dist/plugins/ot-dashboard/test/auth.test.js dist/plugins/ot-dashboard/test/home-setup.test.js dist/plugins/ot-dashboard/test/editor-layout.test.js dist/plugins/ot-dashboard/test/operational-pages.test.js` passed with `45` tests, `0` failures.

## Browser/manual checks

Authenticated fixture route:

- `/dash/admin/plugins`

Desktop `1440x900`:

- The add-ons shell remained matte, with `box-shadow: none` and `background-image: none`.
- The inventory shell rendered at about `1109px` wide and started about `98px` below the top of the content column after the intro slab removal.
- The first grouped row measured about `173px` tall with a `1fr + auto` layout, down from the earlier `184px` boxed-row state, while keeping inline `Open / Manifest` actions visible.
- Group headings now carry the operational-state marker, so rows no longer repeat per-item state bars or JSON filename preview noise.

Mobile `390x844`:

- The mobile rail now measures about `409px` tall and the inventory shell starts about `365px` below the top of the viewport, down from the earlier `560px` content start when the rail stacked as taller one-column cards.
- The first row measured about `231px` tall with inline actions and compact metadata instead of a boxed fact grid and preview stack.
- Navigation and utility controls render as two-column grids, keeping the page aligned with the restrained admin/login family while reaching inventory content sooner.

Filtered empty-state check:

- Entering `zzzz-not-a-plugin` hid all groups and rows, surfaced `No add-ons match this search`, and left `0` visible groups with `0` visible rows.
