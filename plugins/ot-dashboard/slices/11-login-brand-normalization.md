# Slice 11: Login Brand Normalization

## Objective

Remove the redundant `Admin access` eyebrow from the login masthead and normalize the dashboard-name treatment so it reads as a cleaner branded heading.

## Exact files

- `plugins/ot-dashboard/public/views/login.ejs`
- `plugins/ot-dashboard/public/global.css`
- `plugins/ot-dashboard/locales/english.json`
- `plugins/ot-dashboard/test/app.test.ts`
- `plugins/ot-dashboard/test/home-setup.test.ts`

## Locked implementation decisions

- Keep routing, auth, and the inline health utility unchanged.
- Remove the eyebrow entirely instead of renaming it.
- Reduce the visual weight of the dashboard name without making it hard to identify.

## Verification for this slice

```bash
npm run build
node --test dist/plugins/ot-dashboard/test/app.test.js dist/plugins/ot-dashboard/test/auth.test.js dist/plugins/ot-dashboard/test/home-setup.test.js
```

## Completion

- Completed on 2026-03-28.
- The redundant eyebrow is removed.
- The dashboard-name treatment is smaller and more balanced.
