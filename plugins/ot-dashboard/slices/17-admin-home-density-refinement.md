# Slice 17: Admin Home Density Refinement

## Status

Completed on 2026-03-28.

## Objective

Reduce the remaining top-of-page dead space on `/admin` by consolidating the intro and summary into a tighter workspace block and by tightening the surrounding shell spacing.

## Exact files

- `plugins/ot-dashboard/public/views/admin-shell.ejs`
- `plugins/ot-dashboard/public/views/sections/overview.ejs`
- `plugins/ot-dashboard/public/global.css`
- `plugins/ot-dashboard/test/app.test.ts`
- `plugins/ot-dashboard/test/home-setup.test.ts`

## Locked implementation decisions

- Keep the flat-black theme direction and existing route behavior intact.
- Preserve the current rail navigation and setup-card flow.
- Improve density by consolidating and tightening, not by adding new decorative elements.

## Implementation summary

- Moved the `/admin` overview intro and summary metrics into one shared top workspace block instead of rendering them as separate stacked bands.
- Tightened admin-shell spacing, summary cards, status strip padding, section spacing, and footer padding so the home screen reads denser.
- Kept setup cards, navigation, and the flat-black theme direction intact while reducing dead space around them.

## Verification for this slice

```bash
npm run build
node --test dist/plugins/ot-dashboard/test/app.test.js dist/plugins/ot-dashboard/test/auth.test.js dist/plugins/ot-dashboard/test/home-setup.test.js
```

## Browser evidence

- `output/playwright/admin-home-density-refined.png`
