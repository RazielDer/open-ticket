# Slice 59: Questions Workspace Structure and Flow Rebalance

## Objective

Rebalance `/visual/questions` around clearer usage/identity lanes, denser summary copy, and a final save row.

## Scope

- `public/views/config-questions.ejs`
- `public/global.css`
- `locales/english.json`
- `test/editor-layout.test.ts`

## Implementation

- Add a Questions-specific workspace page class and page-specific layout hooks.
- Replace the generic header stat and tighten inventory copy/heading structure.
- Convert the main editor from one long stack into a paired desktop lane for `usage + identity`.
- Move the reference warning beside the usage summary where the operator resolves the blocked action.
- Convert the sticky save bar into a final commit row.

## Verification

```bash
npm run build
node --test dist/plugins/ot-dashboard/test/editor-layout.test.js dist/plugins/ot-dashboard/test/operational-pages.test.js
```
