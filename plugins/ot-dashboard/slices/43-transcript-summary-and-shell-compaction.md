# Slice 43: Transcript Summary And Shell Compaction

## Objective

Compact the transcript workspace header and filtered summary so `/admin/transcripts` stops opening with a same-weight wall of transcript summary cards.

## Exact files

- `plugins/ot-dashboard/public/views/sections/transcripts.ejs`
- `plugins/ot-dashboard/public/global.css`
- `plugins/ot-dashboard/server/transcript-control-center.ts`
- `plugins/ot-dashboard/locales/english.json`
- `plugins/ot-dashboard/test/transcript-workspace.test.ts`
- `plugins/ot-dashboard/test/operational-pages.test.ts`

## Locked implementation decisions

- Keep transcript routes, filters, bulk-action routes, and return-to handling unchanged.
- Preserve transcript settings and add-on reachability from the page header.
- Do not remove summary information outright when it still matters operationally; change its hierarchy and density instead.

## Required changes

- Reduce the visual weight and height of the transcript workspace header facts.
- Replace the filtered-summary card wall with a denser transcript-specific summary strip.
- Keep the page matte and shadow-free while reducing top-of-page height on both desktop and stacked/mobile layouts.

## Verification for this slice

```bash
npm run build
node --test dist/plugins/ot-dashboard/test/transcript-workspace.test.js dist/plugins/ot-dashboard/test/operational-pages.test.js
```
