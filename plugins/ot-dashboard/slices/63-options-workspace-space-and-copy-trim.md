# Slice 63: Options Workspace Space And Copy Trim

## Goal

Remove redundant text and reduce wasted space in `/visual/options` without changing any Options editor behavior.

## Scope

- `public/views/config-options.ejs`
- `public/global.css`
- `locales/english.json`
- `test/editor-layout.test.ts`

## Changes

1. Trim inventory and stage helper copy while simplifying inventory rows to operator-facing name, type, and ID.
2. Collapse the summary strip to label/value cards and move the panel-reference warning into the dependency surface.
3. Rebalance identity and dependency into a shared desktop lane and remove dependency/ticket/website/role intro copy that only repeats headings.
4. Convert the save row to a single `Save changes` label.

## Verification

```bash
npm run build
node --test dist/plugins/ot-dashboard/test/editor-layout.test.js dist/plugins/ot-dashboard/test/operational-pages.test.js
```
