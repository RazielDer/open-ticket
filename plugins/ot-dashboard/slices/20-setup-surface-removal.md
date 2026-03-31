# Slice 20: Setup Surface Removal

## Status

Completed on 2026-03-28.

## Objective

Remove the redundant Setup landing surface so Home becomes the only setup hub, while config-detail pages remain reachable through Home setup cards.

## Exact files

- `plugins/ot-dashboard/server/control-center.ts`
- `plugins/ot-dashboard/server/home-setup-models.ts`
- `plugins/ot-dashboard/server/routes/admin.ts`
- `plugins/ot-dashboard/locales/english.json`
- `plugins/ot-dashboard/test/app.test.ts`
- `plugins/ot-dashboard/test/home-setup.test.ts`

## Locked implementation decisions

- Delete the Setup landing surface instead of reworking it again.
- Keep `/admin/configs/:id` detail routes working.
- Redirect `/admin/configs` to `/admin`.
- Remove the redundant Setup rail item so the shell has one setup hub.

## Verification for this slice

```bash
npm run build
node --test dist/plugins/ot-dashboard/test/app.test.js dist/plugins/ot-dashboard/test/auth.test.js dist/plugins/ot-dashboard/test/home-setup.test.js
```

## Outcome

- `/admin/configs` now redirects to `/admin`.
- The Setup rail item is removed from the admin shell.
- Home remains the only setup hub, while `/admin/configs/:id` detail routes still work.
