# Slice 04: Operational Pages and Expert Workbenches

## Objective

Reframe the deeper operational pages so they feel denser, clearer, and safer without removing expert capability.

## Exact files

- `plugins/ot-dashboard/server/routes/admin.ts`
- `plugins/ot-dashboard/server/transcript-control-center.ts` if presentation data must be enriched
- `plugins/ot-dashboard/public/views/sections/config-detail.ejs`
- `plugins/ot-dashboard/public/views/sections/plugin-detail.ejs`
- `plugins/ot-dashboard/public/views/sections/plugin-asset-detail.ejs`
- `plugins/ot-dashboard/public/views/sections/tickets.ejs`
- `plugins/ot-dashboard/public/views/sections/transcripts.ejs`
- `plugins/ot-dashboard/public/views/sections/transcript-detail.ejs`
- `plugins/ot-dashboard/public/views/sections/runtime.ejs`
- `plugins/ot-dashboard/public/views/sections/evidence.ejs`
- `plugins/ot-dashboard/locales/english.json`

## Locked implementation decisions

- Transcript destructive actions remain only on transcript detail pages.
- Runtime and Evidence must read as Advanced destinations and link back to `/admin/advanced`.
- Plugin and transcript workbench capabilities remain intact, but advanced sections can visually demote them.

## Required changes

- In `config-detail.ejs`:
  - render this exact order:
    1. what this area controls
    2. common tasks / current-state summary
    3. primary visual-editor action
    4. advanced tools section
  - advanced tools must keep preview changes, export, backup restore, and raw JSON entry points
- In `plugin-detail.ejs`:
  - put purpose, health, and quick facts first
  - keep transcript workspace, manifest, asset, backup, registry, and provider-action sections intact, but group them as expert tools after overview
- In `plugin-asset-detail.ejs`:
  - keep review/apply/export/restore flows intact
  - use the new dense advanced-panel treatment instead of generic card grammar
- In `tickets.ejs` and `transcripts.ejs`:
  - keep filters and tables, but tighten table headers, row density, and empty-state tone
  - row actions stay quiet and contextual
- In `transcript-detail.ejs`:
  - keep the main/detail split layout
  - make reissue the clear safe primary
  - make revoke secondary
  - make delete visually dangerous, not subtle
  - preserve disabled semantics and helper copy
- In `runtime.ejs` and `evidence.ejs`:
  - keep the data
  - reframe copy and section labels as advanced maintenance surfaces
  - keep clear routes back to `/admin/advanced`

## Verification for this slice

```powershell
npm run build
node --test dist/plugins/ot-dashboard/test/operational-pages.test.js dist/plugins/ot-dashboard/test/transcript-workspace.test.js dist/plugins/ot-dashboard/test/route-copy.test.js
```

## Done when

- Deep operational pages feel denser and clearer than the current generic-card system.
- Expert tools still exist and still work.
- Transcript destructive actions remain isolated to transcript detail.
