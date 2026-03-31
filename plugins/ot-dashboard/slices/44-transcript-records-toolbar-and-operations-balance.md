# Slice 44: Transcript Records Toolbar And Operations Balance

## Objective

Compress the records-adjacent controls and rebalance operations so the records table reads as the primary workflow instead of being buried beneath secondary slabs.

## Exact files

- `plugins/ot-dashboard/public/views/sections/transcripts.ejs`
- `plugins/ot-dashboard/public/global.css`
- `plugins/ot-dashboard/locales/english.json`
- `plugins/ot-dashboard/test/transcript-workspace.test.ts`
- `plugins/ot-dashboard/test/operational-pages.test.ts`

## Locked implementation decisions

- Keep the records table, pagination, bulk-action forms, and transcript detail links working.
- Keep operations overview available and readable without moving it back ahead of transcript records.
- Keep copy conservative: trim operator-facing clutter without weakening warnings or action guidance.

## Required changes

- Compress bulk actions into a denser records toolbar that sits closer to the table.
- Reduce redundant or low-value helper copy around the records toolbar.
- Tighten the operations overview hierarchy so it reads as secondary analysis instead of another large card wall.

## Verification for this slice

```bash
npm run build
node --test dist/plugins/ot-dashboard/test/transcript-workspace.test.js dist/plugins/ot-dashboard/test/operational-pages.test.js
```
