# Slice 01: Theme Foundation, Tokens, and Primitive Reset

## Objective

Replace the conflicting theme base with one dark graphite system and reset the shared UI primitives before any page-level redesign starts.

## Exact files

- `plugins/ot-dashboard/public/global.css`
- `plugins/ot-dashboard/public/views/partials/head.ejs`
- `plugins/ot-dashboard/server/brand.ts` only if token defaults need alignment

## Locked implementation decisions

- Keep `Public Sans` only.
- Delete the later light `:root` override entirely rather than layering a third token system on top.
- Use the locked graphite token values from `evidence/planning-basis.md`.
- Do not change page composition, route copy, or route order yet unless a primitive class rename requires a small template touch.

## Required changes

- In `public/global.css`:
  - collapse all color, spacing, border, radius, and shadow tokens into one top-level source of truth
  - remove every `Space Grotesk` reference
  - reset `.dashboard-body`, `.site-header`, `.site-footer`, `.control-shell`, `.control-rail`, `.hero-panel`, `.section-card`, `.config-card`, `.item-card`, `.summary-card`, `.empty-panel`, `.status-strip`, `.status-pill`, `.btn.*`, `.text-input`, `.select-input`, `.data-table`, `.pagination-bar`, and modal surfaces to the dark graphite system
  - make badges sentence case instead of all caps
  - reduce radii to the locked `16 / 12 / 10` scale
  - keep a restrained focus ring on buttons, links, and controls
- In `partials/head.ejs`:
  - keep the existing `Public Sans` import
  - do not add another font
- In `server/brand.ts`:
  - keep warm accent defaults
  - do not rely on configurable light surface colors for the admin shell

## Verification for this slice

```powershell
rg -n "Space Grotesk|^:root" plugins/ot-dashboard/public/global.css plugins/ot-dashboard/public/views/partials/head.ejs
npm run build
node --test dist/plugins/ot-dashboard/test/app.test.js dist/plugins/ot-dashboard/test/auth.test.js
```

## Done when

- `public/global.css` has one dark token ladder.
- The admin UI no longer inherits pale or white-first surfaces.
- All shared primitives are readable and restrained on dark.
- The next slice can change shell composition without revisiting token chaos.
