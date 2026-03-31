# Slice 47: Transcript Records And Operations Density

## Objective

Make the records workflow flatter and calmer so the table and record actions read as the primary path, with operations still reachable but less visually heavy.

## Exact files

- `plugins/ot-dashboard/public/views/sections/transcripts.ejs`
- `plugins/ot-dashboard/public/global.css`
- `plugins/ot-dashboard/locales/english.json`
- `plugins/ot-dashboard/test/transcript-workspace.test.ts`
- `plugins/ot-dashboard/test/operational-pages.test.ts`

## Locked implementation decisions

- Keep the records table, pagination, detail links, bulk-action endpoints, and public-link reachability unchanged.
- Leave operations available, but treat them as secondary analysis rather than another competing card wall.
- Preserve bulk select-all and selected-count behavior while reducing visual weight around the toolbar.

## Required changes

- Fold the filtered summary into the records heading.
- Flatten bulk tools into a divider-based toolbar attached to the records shell.
- Reduce nested card chrome in operations and replace the retention mini-card wall with a denser fact strip.
- Keep the mobile transcript header facts in a denser side-by-side arrangement.
- Rerun the scoped transcript verification set after the structural trim.

## Verification for this slice

```bash
npm run build
node --test dist/plugins/ot-dashboard/test/transcript-workspace.test.js dist/plugins/ot-dashboard/test/operational-pages.test.js
```
