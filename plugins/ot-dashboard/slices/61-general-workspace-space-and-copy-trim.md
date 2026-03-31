# Slice 61: General Workspace Space And Copy Trim

## Goal

Remove redundant text and reduce wasted space in `/visual/general` without changing any General editor behavior.

## Scope

- `public/views/config-general.ejs`
- `public/global.css`
- `locales/english.json`
- `test/editor-layout.test.ts`
- `test/operational-pages.test.ts`

## Changes

1. Replace the redundant General header stat with live command-entry context.
2. Shorten sidebar navigation copy and labels.
3. Rebuild the connection section into a denser two-lane layout.
4. Rebalance `Status`, `Logs`, and `Limits` into a calmer split band on desktop.
5. Trim General-specific advanced and save copy that only repeats visible headings or actions.

## Verification

```bash
npm run build
node --test dist/plugins/ot-dashboard/test/editor-layout.test.js dist/plugins/ot-dashboard/test/operational-pages.test.js
```
