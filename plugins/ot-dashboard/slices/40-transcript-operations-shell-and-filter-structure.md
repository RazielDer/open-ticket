# Slice 40: Transcript Operations Shell And Filter Structure

## Objective

Rebuild `/admin/transcripts` around one integrated transcript workspace header and a responsive filter disclosure so the page stops spending most of its first screen on repeated status chrome and oversized filter controls.

## Exact files

- `plugins/ot-dashboard/public/views/sections/transcripts.ejs`
- `plugins/ot-dashboard/public/global.css`
- `plugins/ot-dashboard/server/routes/admin.ts`
- `plugins/ot-dashboard/server/transcript-control-center.ts`
- `plugins/ot-dashboard/locales/english.json`
- `plugins/ot-dashboard/test/transcript-workspace.test.ts`
- `plugins/ot-dashboard/test/operational-pages.test.ts`

## Locked implementation decisions

- Keep the transcript list route and query parameters unchanged.
- Keep filter fields, submitted names, bulk-action forms, and return-to handling unchanged.
- Use the existing responsive disclosure primitive for filters instead of inventing a new interaction model.
- Preserve transcript config/plugin links, but move them into the integrated page header instead of repeating them in multiple surfaces.

## Required changes

- Hide the transcript list route’s shell hero and shell summary-card stack.
- Build one integrated transcript workspace header inside the transcripts template.
- Reduce duplicated unavailable-state messaging at the top of the page.
- Convert the filter area into a responsive disclosure that stays open on desktop and collapses on stacked/mobile widths.
- Keep active filter chips readable outside the collapsed filter body.

## Verification for this slice

```bash
npm run build
node --test dist/plugins/ot-dashboard/test/transcript-workspace.test.js dist/plugins/ot-dashboard/test/operational-pages.test.js
```
