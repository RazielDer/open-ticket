# Slice 03: Guided Home, Setup, Add-ons, and Advanced Workspaces

## Objective

Rebuild the high-traffic workspace pages so setup work, operations, add-ons, and expert destinations scan differently and in the right order.

## Exact files

- `plugins/ot-dashboard/server/home-setup-models.ts`
- `plugins/ot-dashboard/server/routes/admin.ts`
- `plugins/ot-dashboard/public/views/sections/overview.ejs`
- `plugins/ot-dashboard/public/views/sections/configs.ejs`
- `plugins/ot-dashboard/public/views/sections/plugins.ejs`
- `plugins/ot-dashboard/public/views/sections/advanced.ejs`
- `plugins/ot-dashboard/locales/english.json`

## Locked implementation decisions

- `/admin` order is exact:
  1. status ribbon from the shell
  2. compact intro
  3. summary cards
  4. recommended action module
  5. setup status grid
  6. daily operations grid
  7. warnings
- `/admin/configs` keeps search, but setup cards become the core workhorse pattern.
- `/admin/plugins` is a scanning-friendly inventory, not a wall of generic cards.
- `/admin/advanced` groups diagnostics, backups, raw editors, workbenches, and maintenance links in that order.

## Required changes

- In `home-setup-models.ts`:
  - preserve setup-state logic
  - expose `recommendedAction` instead of a vague `nextStep` blob
  - give setup cards stable anatomy fields: meta label, state label, what it controls, why it matters now, primary action, secondary action
  - give daily operations a semantic `kind`
- In `overview.ejs`:
  - replace the one-card “what to do next” slab with a tighter recommended-action module
  - render setup cards with state-forward anatomy
  - render daily operations in a distinct operations-card family
- In `configs.ejs`:
  - keep the search box
  - render setup cards with the same anatomy as Home, but expose secondary raw-editor access here
  - keep Advanced as a lower-priority destination at the bottom
- In `plugins.ejs`:
  - keep search
  - make status, source, and action scanning clearer
  - reduce pill clutter; tags stay secondary metadata
- In `advanced.ejs`:
  - group expert destinations into distinct advanced panels rather than generic section cards
- In `routes/admin.ts` and `english.json`:
  - align copy and page-intro text to the new guided-workspace framing

## Verification for this slice

```powershell
npm run build
node --test dist/plugins/ot-dashboard/test/home-setup.test.js dist/plugins/ot-dashboard/test/operational-pages.test.js
```

## Done when

- Home immediately explains health, next action, setup state, and daily tools.
- Setup reads like guided configuration work instead of a generic card grid.
- Add-ons and Advanced feel distinct from setup rather than like the same card template repeated.
