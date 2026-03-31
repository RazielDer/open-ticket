# Slice 18: Admin Home Overview Compaction

## Status

Completed on 2026-03-28.

## Objective

Remove the stretched header and footer slab feeling on `/admin` by integrating the status strip into the home overview card and by preventing the admin shell grid rows from expanding to fill the viewport.

## Exact files

- `plugins/ot-dashboard/public/views/admin-shell.ejs`
- `plugins/ot-dashboard/public/views/sections/overview.ejs`
- `plugins/ot-dashboard/public/global.css`
- `plugins/ot-dashboard/test/app.test.ts`
- `plugins/ot-dashboard/test/home-setup.test.ts`

## Locked implementation decisions

- Keep the flat-black theme direction and existing route behavior intact.
- Preserve the current rail navigation and setup-card flow.
- Fix the inflated-band problem through layout compaction, not by adding new sections or new copy.

## Implementation summary

- Rendered the home status strip inside the overview stage instead of as a separate top band.
- Stopped the admin shell grid from stretching content rows across the viewport.
- Tightened the overview-stage and footer spacing so the page starts and ends closer to the content.

## Verification for this slice

```bash
npm run build
node --test dist/plugins/ot-dashboard/test/app.test.js dist/plugins/ot-dashboard/test/auth.test.js dist/plugins/ot-dashboard/test/home-setup.test.js
```

## Browser evidence

- `output/playwright/admin-home-overview-compaction.png`
