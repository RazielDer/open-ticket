# Slice 10: Login Surface Hierarchy Refinement

## Objective

Refine the current login-first entry so the card feels anchored, the brand reads as identity instead of link text, and the inline health utility stays secondary without leaving an empty placeholder block.

## Exact files

- `plugins/ot-dashboard/public/views/login.ejs`
- `plugins/ot-dashboard/public/js/login.js`
- `plugins/ot-dashboard/public/global.css`
- `plugins/ot-dashboard/locales/english.json`
- `plugins/ot-dashboard/test/app.test.ts`
- `plugins/ot-dashboard/test/home-setup.test.ts`

## Locked implementation decisions

- Keep the current root redirect and auth behavior unchanged.
- Keep text-only branding and no header banner on login.
- Replace the current heavy underline treatment with a calmer brand presentation that still stands out.
- Demote `Health` from full-width secondary action to a compact inline utility.
- Ensure hidden status UI remains invisible until interaction.

## Verification for this slice

```bash
npm run build
node --test dist/plugins/ot-dashboard/test/app.test.js dist/plugins/ot-dashboard/test/auth.test.js dist/plugins/ot-dashboard/test/home-setup.test.js
```

## Completion

- Completed on 2026-03-28.
- Card placement, brand hierarchy, and health utility prominence were refined without changing route or auth behavior.
- The blank hidden-status panel regression is fixed.
