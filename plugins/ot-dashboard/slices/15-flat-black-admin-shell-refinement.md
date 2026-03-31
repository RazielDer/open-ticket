# Slice 15: Flat Black Admin Shell Refinement

## Status

Completed on 2026-03-28.

## Objective

Refine the authenticated admin shell so it reads as a flatter black interface instead of a stack of medium-gray panels, while preserving the current layout and workflow.

## Exact files

- `plugins/ot-dashboard/public/global.css`
- `plugins/ot-dashboard/public/views/admin-shell.ejs`
- `plugins/ot-dashboard/public/views/sections/overview.ejs`
- `plugins/ot-dashboard/test/app.test.ts`
- `plugins/ot-dashboard/test/home-setup.test.ts`

## Locked implementation decisions

- Keep the existing route paths, auth, CSRF, and dashboard home structure intact.
- Preserve the current admin home layout order unless a small visual cleanup materially improves readability.
- Move the authenticated shell closer to a flat-black palette by reducing panel contrast and tinted chrome, not by introducing new decorative effects.
- Keep all changed user-facing copy locale-backed if any copy changes become necessary.

## Implementation summary

- Darkened and neutralized the shared dashboard surface tokens in `public/global.css` so the app background, shell, cards, rail, and footer read as matte black instead of layered charcoal.
- Reduced tinted status and border chrome so the health strip, pills, utility boxes, and buttons keep contrast without glowing or looking glossy.
- Tightened the admin home card density without changing layout so the screen stays operationally familiar while reading calmer and flatter.
- Updated `test/home-setup.test.ts` so the mature-home assertion uses a healthy transcript runtime bridge and reflects the intended ready-state contract.

## Verification for this slice

```bash
npm run build
node --test dist/plugins/ot-dashboard/test/app.test.js dist/plugins/ot-dashboard/test/auth.test.js dist/plugins/ot-dashboard/test/home-setup.test.js
```

## Browser evidence

- `output/playwright/login-flat-black-preview.png`
- `output/playwright/admin-home-flat-black-preview.png`
