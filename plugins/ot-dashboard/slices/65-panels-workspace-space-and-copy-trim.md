# Slice 65: Panels Workspace Space And Copy Trim

## Goal

Remove redundant text and reduce wasted space in `/visual/panels` without changing any Panels editor behavior.

## Scope

- `public/views/config-panels.ejs`
- `public/global.css`
- `locales/english.json`
- `test/editor-layout.test.ts`
- `test/app.test.ts`

## Changes

1. Trim inventory, stage, section, advanced, and save helper copy that only repeats visible controls.
2. Collapse the summary strip to label/value cards and tighten Panels-specific spacing in inventory, preview, and save surfaces.
3. Shorten visible headings where that improves scan speed without changing picker/preview behavior.

## Verification

```bash
npm run build
node --test dist/plugins/ot-dashboard/test/editor-layout.test.js dist/plugins/ot-dashboard/test/operational-pages.test.js
```
