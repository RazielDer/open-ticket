# Slice 32: Editor Card Compaction And Copy Tuning

## Objective

Trim the remaining duplicate headings and shorten the most space-wasting helper copy so the four workspaces read cleaner without removing meaningful guidance.

## Exact files

- `plugins/ot-dashboard/locales/english.json`
- `plugins/ot-dashboard/public/views/config-general.ejs`
- `plugins/ot-dashboard/public/views/config-options.ejs`
- `plugins/ot-dashboard/public/views/config-panels.ejs`
- `plugins/ot-dashboard/public/views/config-questions.ejs`
- `plugins/ot-dashboard/public/views/partials/editor-advanced-tools.ejs`
- `plugins/ot-dashboard/test/editor-layout.test.ts`
- `plugins/ot-dashboard/test/app.test.ts`

## Locked implementation decisions

- Keep warnings, validation text, advanced actions, and raw JSON language intact unless a tiny wording trim is needed for consistency.
- Remove duplicate micro-headings where a kicker and heading currently say the same thing in the same card.
- Favor shorter operator-facing copy in summary/detail cards when the current sentence length is making the layout materially taller.
- Do not widen this slice into route changes, data-shape changes, or JS behavior changes unless a markup class hook is required for the UI polish.

## Required changes

- Remove duplicate kicker text from item-card headers in the options, panels, and questions workspaces where it repeats the visible title.
- Shorten the header, stat, inventory, and save-bar copy that is currently inflating the layout without adding distinct meaning.
- Keep one useful sentence per area instead of repeating the same explanation across the card heading, detail line, and helper copy.

## Verification for this slice

```bash
npm run build
node --test dist/plugins/ot-dashboard/test/editor-layout.test.js dist/plugins/ot-dashboard/test/app.test.js
```
