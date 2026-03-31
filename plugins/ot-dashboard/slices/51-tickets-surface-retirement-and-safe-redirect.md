# Slice 51: Tickets Surface Retirement And Safe Redirect

## Objective

Retire the dedicated `/admin/tickets` page without affecting runtime ticket tracking, Home summaries, or unrelated dashboard routes.

## Exact files

- `plugins/ot-dashboard/server/control-center.ts`
- `plugins/ot-dashboard/server/home-setup-models.ts`
- `plugins/ot-dashboard/server/routes/admin.ts`
- `plugins/ot-dashboard/locales/english.json`
- `plugins/ot-dashboard/public/views/sections/tickets.ejs`
- `plugins/ot-dashboard/README.md`
- `plugins/ot-dashboard/test/app.test.ts`
- `plugins/ot-dashboard/test/operational-pages.test.ts`

## Locked implementation decisions

- Keep the admin shell, Express + EJS architecture, and existing `/admin` route unchanged.
- Remove the Tickets rail item instead of replacing it with another new top-level surface.
- Redirect `/admin/tickets` to `/admin` for authenticated requests instead of rendering the old page or returning 404.
- Keep Home and shared shell ticket summary counts intact.

## Required changes

- Remove the Tickets item from the authenticated primary nav.
- Replace the dedicated Tickets page route with a safe redirect to Home.
- Delete the now-unused Tickets template and locale block.
- Trim stale user-facing copy that still lists `Tickets` as a current rail surface.
- Update docs and route-render tests to match the retired page.

## Verification for this slice

```bash
npm run build
node --test dist/plugins/ot-dashboard/test/app.test.js dist/plugins/ot-dashboard/test/auth.test.js dist/plugins/ot-dashboard/test/home-setup.test.js dist/plugins/ot-dashboard/test/editor-layout.test.js dist/plugins/ot-dashboard/test/operational-pages.test.js dist/plugins/ot-dashboard/test/transcript-workspace.test.js
```
