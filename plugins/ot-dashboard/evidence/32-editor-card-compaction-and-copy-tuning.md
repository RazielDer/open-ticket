# Slice 32 Evidence: Editor Card Compaction And Copy Tuning

## Completed changes

- Removed duplicate micro-headings from page-specific item cards:
  - `Options`: `Assigned questions`, `Referencing panels`
  - `Panels`: `Selected options`, `Member-facing summary`
  - `Questions`: `Referenced by options`
- Shortened the most space-wasting locale-backed copy in `locales/english.json`:
  - shared workspace subtitle/help lines
  - stat-card detail text
  - save-bar copy
  - high-frequency editor helper text across `General`, `Options`, `Panels`, and `Questions`
- Shortened the array-editor duplicate action label from `Duplicate as new` to `Duplicate` so the mobile toolbar buttons fit cleanly inside the new two-column grid.

## Verification

```bash
npm run build
node --test dist/plugins/ot-dashboard/test/editor-layout.test.js dist/plugins/ot-dashboard/test/app.test.js
```

- `npm run build`: TypeScript compile succeeded after the locale/template changes.
- `node --test ...editor-layout.test.js ...app.test.js`: passed with `30` tests, `0` failures.

## Result

- The top editor cards now carry one clear title layer instead of a title plus a repeated kicker.
- The dependency and preview cards are visibly shorter because the repeated heading line is gone and the detail copy is shorter.
- The mobile toolbars retain all actions while the buttons now fit in uniform `44px` controls.
