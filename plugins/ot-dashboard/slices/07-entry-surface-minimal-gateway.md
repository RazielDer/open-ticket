# Slice 07: Entry Gateway Simplification And Visual Restraint

## Objective

Refactor the public landing and login pages into a minimal dark gateway that feels calmer and more intentional while preserving the current route and auth contracts.

## Exact files

- `plugins/ot-dashboard/public/views/index.ejs`
- `plugins/ot-dashboard/public/views/login.ejs`
- `plugins/ot-dashboard/public/views/partials/header.ejs`
- `plugins/ot-dashboard/public/views/partials/footer.ejs`
- `plugins/ot-dashboard/public/global.css`
- `plugins/ot-dashboard/locales/english.json`
- `plugins/ot-dashboard/test/app.test.ts`
- `plugins/ot-dashboard/test/home-setup.test.ts`

## Locked implementation decisions

- `/` is a gateway, not a feature summary page.
- `/login` remains a single-purpose authentication form.
- Health stays available, but as a secondary utility.
- Shared public entry styling can differ from the denser authenticated dashboard shell.
- All changed copy remains locale-backed.

## Required changes

- Remove duplicated landing explanations and repeated card stacks.
- Reduce entry-page chrome so brand, title, body copy, and the primary action dominate the first viewport.
- Keep supporting context to one subdued block on the landing and one subdued block on login.
- Flatten accent treatment on public entry pages by removing large glows and reducing surface tinting.
- Keep responsive behavior intact across desktop and mobile widths.

## Verification for this slice

```bash
npm run build
node --test dist/plugins/ot-dashboard/test/app.test.js dist/plugins/ot-dashboard/test/auth.test.js dist/plugins/ot-dashboard/test/home-setup.test.js
```

## Done when

- `/` reads as one clean gateway into admin.
- `/login` feels like the same product without repeating the landing-page weight.
- Existing auth and redirect behavior remains unchanged.
