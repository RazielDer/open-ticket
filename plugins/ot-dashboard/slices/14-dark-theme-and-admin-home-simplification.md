# Slice 14: Dark Theme And Admin Home Simplification

## Objective

Remove decorative glow from the login and admin surfaces, then simplify the `/admin` home flow so it feels calmer, clearer, and more end-user-ready.

## Exact files

- `plugins/ot-dashboard/public/global.css`
- `plugins/ot-dashboard/public/views/admin-shell.ejs`
- `plugins/ot-dashboard/public/views/sections/overview.ejs`
- `plugins/ot-dashboard/server/routes/admin.ts`
- `plugins/ot-dashboard/server/home-setup-models.ts`
- `plugins/ot-dashboard/server/control-center.ts`
- `plugins/ot-dashboard/locales/english.json`
- `plugins/ot-dashboard/test/app.test.ts`
- `plugins/ot-dashboard/test/home-setup.test.ts`

## Locked implementation decisions

- Keep the login card layout unchanged while flattening the theme.
- Keep route paths, auth, CSRF, and return-to behavior unchanged.
- Simplify `/admin` by reducing repeated status storytelling and trimming redundant copy.
- Keep all changed user-facing strings locale-backed.

## Verification for this slice

```bash
npm run build
node --test dist/plugins/ot-dashboard/test/app.test.js dist/plugins/ot-dashboard/test/auth.test.js dist/plugins/ot-dashboard/test/home-setup.test.js
```

## Results

- The login screen kept the same layout but now renders as a plain matte dark surface with no decorative glow.
- The shared admin shell now uses the same restrained dark treatment, including flatter surfaces, calmer status styling, and text-only rail branding.
- The `/admin` home removes repeated status storytelling, trims setup-card copy, drops the redundant `Public landing` utility, and hides the mature-state `Next step` block when daily work is already ready.
