# Slice 02: Shell, Navigation Rail, Status Ribbon, and Top-of-Page Contract

## Objective

Rebuild the shell so every page inherits stronger hierarchy, a clearer rail, and a compact operational first viewport.

## Exact files

- `plugins/ot-dashboard/public/views/admin-shell.ejs`
- `plugins/ot-dashboard/server/control-center.ts`
- `plugins/ot-dashboard/server/routes/admin.ts`
- `plugins/ot-dashboard/locales/english.json`

## Locked implementation decisions

- Primary nav stays exactly `Home`, `Setup`, `Tickets`, `Transcripts`, `Add-ons`, `Advanced`.
- Runtime and Evidence remain reachable through Advanced only.
- The utility stack contains `Public landing`, `Health`, and `Log out`, visually separated from the primary nav.
- The shell-wide automation-tools section is removed; route-specific expert sections own those actions instead.

## Required changes

- In `admin-shell.ejs`:
  - keep the left rail structure, but split it into brand, primary nav, and utility groups
  - replace the oversized `hero-panel` usage with a compact `page-intro` block
  - render a tighter `status-strip` above the content area
  - render typed summary cards with distinct classes for status vs metric cards
- In `control-center.ts`:
  - keep `buildAdminNav()` order unchanged
  - enrich `buildStatusStrip()` to return `updatedLabel` and `attentionLabel`
  - update `buildAdminShell()` so `summaryCards` support `kind` and optional `tone`
  - stop defaulting shell-wide provider action cards into every page
- In `routes/admin.ts`:
  - update the page-shell locals to the new compact intro and typed summary-card contract
  - locale-back any new shell-facing labels
- In `locales/english.json`:
  - add only the new shell, rail, status-ribbon, and summary-card copy needed for this contract

## Verification for this slice

```powershell
npm run build
node --test dist/plugins/ot-dashboard/test/app.test.js dist/plugins/ot-dashboard/test/home-setup.test.js dist/plugins/ot-dashboard/test/route-copy.test.js
```

## Done when

- The rail is visually authoritative without being heavy-handed.
- The first viewport stops wasting space on a generic hero.
- Shell copy and status treatment are locale-backed and operationally clear.
