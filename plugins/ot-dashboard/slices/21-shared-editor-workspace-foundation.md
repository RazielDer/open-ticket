# Slice 21: Shared Editor Workspace Foundation

## Objective

Establish the shared workspace chrome and advanced-tools contract for `General`, `Options`, `Panels`, and `Questions` before any Home-card or legacy-route cutover.

## Exact files

- `plugins/ot-dashboard/public/global.css`
- `plugins/ot-dashboard/public/views/config-general.ejs`
- `plugins/ot-dashboard/public/views/config-options.ejs`
- `plugins/ot-dashboard/public/views/config-panels.ejs`
- `plugins/ot-dashboard/public/views/config-questions.ejs`
- `plugins/ot-dashboard/public/views/partials/**` for new shared editor partials
- `plugins/ot-dashboard/server/routes/pages.ts`
- `plugins/ot-dashboard/locales/english.json`
- `plugins/ot-dashboard/test/editor-layout.test.ts`

## Locked implementation decisions

- Do not change Home-card links or `/admin/configs/:id` redirects in this slice.
- Build one shared workspace anatomy:
  - page header
  - inventory/editor split
  - sticky save region
  - advanced-tools tray
- Advanced tools must be wired for raw JSON, export, restore, and review parity before the old detail landing is retired.
- Keep the flat-black visual direction and do not reintroduce modal-first framing in the new shell.

## Required changes

- Introduce shared editor partials and CSS primitives for the new workspace layout.
- Pass advanced-tool payloads into the four in-scope visual pages.
- Replace hero-like editor framing with the new restrained workspace framing.
- Keep transcripts untouched except for narrow compatibility changes if a shared editor primitive requires them.

## Verification for this slice

```bash
npm run build
node --test dist/plugins/ot-dashboard/test/editor-layout.test.js dist/plugins/ot-dashboard/test/app.test.js
```
