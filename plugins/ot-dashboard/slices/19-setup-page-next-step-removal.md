# Slice 19: Setup Page Next Step Removal

## Status

Completed on 2026-03-28.

## Objective

Safely delete the redundant `Next step` section from the Setup page so `/admin/configs` stays focused on setup work instead of repeating cross-navigation guidance that belongs to Home.

## Exact files

- `plugins/ot-dashboard/public/views/sections/configs.ejs`
- `plugins/ot-dashboard/server/routes/admin.ts`
- `plugins/ot-dashboard/server/home-setup-models.ts`
- `plugins/ot-dashboard/test/home-setup.test.ts`

## Locked implementation decisions

- Delete only the Setup-page `Next step` surface and the Setup-route wiring that supports it.
- Do not remove the Home-page `recommendedAction` flow.
- Do not change `/admin/configs` routing, setup cards, or Advanced link behavior.

## Implementation summary

- Removed the `Next step` block from `sections/configs.ejs`.
- Stopped passing `recommendedAction` into the Setup route.
- Narrowed the Setup-page model so it no longer carries the deleted page-only field.

## Verification for this slice

```bash
npm run build
node --test dist/plugins/ot-dashboard/test/app.test.js dist/plugins/ot-dashboard/test/auth.test.js dist/plugins/ot-dashboard/test/home-setup.test.js
```

## Browser evidence

- `output/playwright/setup-page-next-step-removed.png`
