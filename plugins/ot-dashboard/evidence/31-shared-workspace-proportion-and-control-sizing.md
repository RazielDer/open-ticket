# Slice 31 Evidence: Shared Workspace Proportion And Control Sizing

## Completed changes

- Tightened the shared workspace shell in `public/global.css`:
  - page width reduced from the previous `1440px` cap to `1360px`
  - sidebar column reduced from the previous `320px` cap to `296px`
  - shared header, stat cards, inventory rows, and save bars now use smaller padding/gaps
  - summary cards use a tighter grid and reduced visual weight
- Added shared layout hooks in the templates:
  - `editor-utility-actions` for the advanced-tools action row
  - `editor-toolbar-actions` for array-editor action groups
  - `editor-savebar-copy` and `editor-savebar-actions` for compact commit bars
- Converted the stacked/mobile editor toolbars from the previous one-button-per-row pattern into a two-column grid while keeping the inventory visible and the advanced-tools tray collapsed by default.

## Verification

```bash
npm run build
node --test dist/plugins/ot-dashboard/test/editor-layout.test.js dist/plugins/ot-dashboard/test/app.test.js
```

- `npm run build`: TypeScript compile succeeded.
- `node --test ...editor-layout.test.js ...app.test.js`: passed with `30` tests, `0` failures.

## Measured outcome

- Desktop (`1440x900`) after the shell pass:
  - shared workspace header: `244px` tall
  - sidebar width: `296px`
  - save bar: `151px` tall
- Mobile (`390x844`) after the shell pass:
  - advanced-tools tray closed by default on all four pages
  - editor toolbars render as a two-column grid instead of a four-row single-column stack
  - first main form section starts around `1037-1127px`, lower than the pre-refinement `1122-1247px` follow-up baseline
