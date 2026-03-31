# Slice 37 Evidence: Add-ons Inventory Grouping And Layout Decluttering

## What changed

- Added server-side grouping for `/admin/plugins` so the inventory is ordered by operational state instead of one mixed wall.
- Updated the inventory template to render grouped sections with compact headings and counts.
- Extended the shared client-side filter so it hides empty groups before falling back to the filtered empty state.

## Verification

- `npm run build`
  - Outcome: compile-only build succeeded with `OT: Compilation Succeeded!`
- `node --test dist/plugins/ot-dashboard/test/app.test.js dist/plugins/ot-dashboard/test/operational-pages.test.js`
  - Outcome: `29` tests passed, `0` failed.

## Notes

- This slice intentionally stopped at grouping and grouped-filter behavior. The per-item layout still uses the older boxed card anatomy and is the focus of slice 38.
