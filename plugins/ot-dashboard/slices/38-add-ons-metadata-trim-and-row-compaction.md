# Slice 38: Add-ons Metadata Trim And Row Compaction

## Objective

Flatten the grouped `/admin/plugins` items into calmer inventory rows and remove redundant visible metadata that is inflating the page without improving scan speed.

## Exact files

- `plugins/ot-dashboard/public/global.css`
- `plugins/ot-dashboard/public/views/sections/plugins.ejs`
- `plugins/ot-dashboard/server/control-center.ts`
- `plugins/ot-dashboard/locales/english.json`
- `plugins/ot-dashboard/test/app.test.ts`
- `plugins/ot-dashboard/test/operational-pages.test.ts`

## Locked implementation decisions

- Keep authors, JSON preview reachability, status, and actions visible.
- Trim only metadata that is repetitive or low-signal on the main inventory surface.
- Prefer inline facts and compact preview treatments over nested boxed meta cards.
- Keep copy conservative and operator-facing.

## Required changes

- Replace the boxed metadata treatment with flatter row-level facts or equivalent compact hierarchy.
- Trim redundant visible facts such as the repeated source field when it does not materially help scanning.
- Reduce tag noise or secondary metadata where it is overwhelming the primary inventory scan path.
- Keep desktop/mobile action reachability and readable item structure after the compaction.

## Verification for this slice

```bash
npm run build
node --test dist/plugins/ot-dashboard/test/app.test.js dist/plugins/ot-dashboard/test/operational-pages.test.js
```
