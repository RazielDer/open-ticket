# Slice 09: Login-First Entry Consolidation

## Objective

Make the dashboard open directly to login, consolidate branding into the central login card, and keep `Health` as inline status feedback instead of page navigation.

## Exact files

- `plugins/ot-dashboard/server/routes/pages.ts`
- `plugins/ot-dashboard/public/views/login.ejs`
- `plugins/ot-dashboard/public/js/login.js`
- `plugins/ot-dashboard/public/global.css`
- `plugins/ot-dashboard/locales/english.json`
- `plugins/ot-dashboard/test/app.test.ts`
- `plugins/ot-dashboard/test/home-setup.test.ts`

## Locked implementation decisions

- `/` redirects to `/login?returnTo=%2Fadmin`.
- Login is the only public entry UI.
- The login card owns the branding; no separate top banner block.
- No icon art renders inside the login page UI.
- `Health` remains available, but only as inline status feedback.
- Subtitle and `Back to landing` are removed.

## Verification for this slice

```bash
npm run build
node --test dist/plugins/ot-dashboard/test/app.test.js dist/plugins/ot-dashboard/test/auth.test.js dist/plugins/ot-dashboard/test/home-setup.test.js
```

## Completion

- Completed on 2026-03-28.
- `/` now redirects into login-first entry.
- Login branding is consolidated into the central card with no icon art or separate header banner.
- `Health` is inline status feedback backed by the existing `/health` JSON route.
