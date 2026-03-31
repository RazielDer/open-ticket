# Slice 41: Transcript Records And Summary Decluttering

## Objective

Tighten the transcript summaries and records flow so the primary list becomes reachable sooner and the operations overview stops competing with the main records surface.

## Exact files

- `plugins/ot-dashboard/public/views/sections/transcripts.ejs`
- `plugins/ot-dashboard/public/global.css`
- `plugins/ot-dashboard/server/transcript-control-center.ts`
- `plugins/ot-dashboard/locales/english.json`
- `plugins/ot-dashboard/test/transcript-workspace.test.ts`
- `plugins/ot-dashboard/test/operational-pages.test.ts`

## Locked implementation decisions

- Keep the records table, bulk actions, pagination, and transcript detail links working.
- Preserve the operations overview, but move it behind the records in the primary reading order.
- Keep the filtered summary available, but render it more compactly and avoid repeating “unavailable” storytelling more than necessary.

## Required changes

- Reduce filtered-summary visual weight and duplicated status labeling.
- Keep bulk actions near the records surface instead of separating them with large secondary sections.
- Move operations overview after transcript records.
- Trim redundant unavailable-state copy in the operations and empty-records surfaces.

## Verification for this slice

```bash
npm run build
node --test dist/plugins/ot-dashboard/test/transcript-workspace.test.js dist/plugins/ot-dashboard/test/operational-pages.test.js
```
