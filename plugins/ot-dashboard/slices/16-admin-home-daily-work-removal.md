# Slice 16: Admin Home Daily Work Removal

## Status

Completed on 2026-03-28.

## Objective

Remove the redundant `Daily work` section from `/admin` so the home screen stops repeating destinations that are already available in the primary navigation.

## Exact files

- `plugins/ot-dashboard/public/views/sections/overview.ejs`
- `plugins/ot-dashboard/server/home-setup-models.ts`
- `plugins/ot-dashboard/server/routes/admin.ts`
- `plugins/ot-dashboard/locales/english.json`
- `plugins/ot-dashboard/test/app.test.ts`
- `plugins/ot-dashboard/test/home-setup.test.ts`

## Locked implementation decisions

- Keep the flat-black theme and overall admin shell layout intact.
- Keep route paths, auth, CSRF, and navigation behavior unchanged.
- Remove the `Daily work` section entirely rather than restyling it.
- Tighten the home-page copy so it does not refer to the removed section.

## Implementation summary

- Removed the `Daily work` band from the home overview template so the page now flows from summary cards directly into `Setup areas`.
- Dropped the unused `dailyOperations` home-model payload and the corresponding admin-route view data.
- Tightened the home subtitle to match the slimmer page and removed the unused locale copy for the deleted section.
- Updated route and home-flow tests so they assert the section and its repeated action copy are gone.

## Verification for this slice

```bash
npm run build
node --test dist/plugins/ot-dashboard/test/app.test.js dist/plugins/ot-dashboard/test/auth.test.js dist/plugins/ot-dashboard/test/home-setup.test.js
```

## Browser evidence

- `output/playwright/admin-home-daily-work-removed.png`
