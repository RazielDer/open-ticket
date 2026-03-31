# Slice 57: Panels Workspace Structure and Flow Rebalance

## Objective

Rebalance `/visual/panels` around clearer builder lanes, denser summary copy, and a final save row.

## Scope

- `public/views/config-panels.ejs`
- `public/global.css`
- `public/js/config-panels.js`
- `locales/english.json`
- `test/editor-layout.test.ts`

## Implementation

- Add a Panels-specific workspace page class and page-specific layout hooks.
- Replace the generic header stat and tighten inventory copy/heading structure.
- Convert the main editor from one long stack into paired desktop lanes for `identity + embed` and `picker + preview`.
- Move the dropdown compatibility warning beside the structured option picker where the operator resolves it.
- Convert the sticky save bar into a final commit row.
- Sanitize saved embed colors before writing them into the `<input type="color">` so stale config values do not trigger browser warnings.

## Verification

```bash
npm run build
node --test dist/plugins/ot-dashboard/test/editor-layout.test.js dist/plugins/ot-dashboard/test/operational-pages.test.js
```
