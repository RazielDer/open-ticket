# Slice 55: Options Workspace Structure And Visibility Fix

## Objective

Refine `/visual/options` so it uses the page more cleanly, hides inactive option-type sections correctly, and reduces the clustered top-of-form stack.

## Exact files

- `plugins/ot-dashboard/public/views/config-options.ejs`
- `plugins/ot-dashboard/public/global.css`
- `plugins/ot-dashboard/locales/english.json`
- `plugins/ot-dashboard/test/editor-layout.test.ts`

## Locked implementation decisions

- Preserve the current save routes, submitted field names, reorder behavior, warnings, and raw JSON reachability.
- Keep the visual system matte, dark, and glow-free.
- Apply the hidden-section fix through shared dashboard CSS instead of adding type-specific JS workarounds.
- Rebalance the Options ticket editor into calmer subsections before considering any new workflow features.

## Required changes

- Fix hidden sections so inactive `ticket`/`website`/`role` editor sections no longer render simultaneously.
- Tighten the Options inventory header and top summary copy.
- Convert the Options toolbar/summary/save surfaces into a calmer layout with a non-sticky final save row.
- Restructure the ticket editor into clearer channel, automation, question-assignment, and transcript-routing subsections.
- Update route/layout tests to lock the new Options structure.

## Verification for this slice

```bash
npm run build
node --test dist/plugins/ot-dashboard/test/editor-layout.test.js dist/plugins/ot-dashboard/test/operational-pages.test.js
```
