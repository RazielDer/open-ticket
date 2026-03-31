# Slice 46: Transcript Shell And Filter Streamlining

## Objective

Reduce the clustered feel at the top of `/admin/transcripts` by simplifying the shell hierarchy, tightening copy, and making the filter area feel lighter.

## Exact files

- `plugins/ot-dashboard/public/views/sections/transcripts.ejs`
- `plugins/ot-dashboard/public/global.css`
- `plugins/ot-dashboard/locales/english.json`
- `plugins/ot-dashboard/test/transcript-workspace.test.ts`
- `plugins/ot-dashboard/test/operational-pages.test.ts`

## Locked implementation decisions

- Preserve transcript routes, auth, CSRF, query names, bulk endpoints, and return-to behavior.
- Keep transcript header facts, but stop presenting them as another equal-weight wall.
- Keep filter reachability intact while making the closed advanced row feel lighter.
- Move active filters into the filter footer instead of keeping them as a detached section.

## Required changes

- Rework the header into one primary metric plus paired secondary facts.
- Tighten the intro and filter copy without weakening warnings or detail-page guidance.
- Flatten the closed `More filters` disclosure so it reads as a lighter advanced row.
- Fold the active-filter chips into the filter footer.
- Update locale strings and route-render tests to match the revised transcript shell.

## Verification for this slice

```bash
npm run build
node --test dist/plugins/ot-dashboard/test/transcript-workspace.test.js dist/plugins/ot-dashboard/test/operational-pages.test.js
```
