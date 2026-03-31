# Slice 69: Shared Brand Favicon And Footer Cleanup

## Objective

Replace the shared dashboard E4 branding pipeline, remove the visible footer from all dashboard-rendered pages, and clear the remaining visible non-auth health shortcuts without changing routes or auth behavior.

## Exact files

- `plugins/ot-dashboard/config.json`
- `plugins/ot-dashboard/server/dashboard-config.ts`
- `plugins/ot-dashboard/server/brand.ts`
- `plugins/ot-dashboard/server/create-app.ts`
- `plugins/ot-dashboard/public/assets/**`
- `plugins/ot-dashboard/public/views/partials/head.ejs`
- `plugins/ot-dashboard/public/views/partials/header.ejs`
- `plugins/ot-dashboard/public/views/partials/footer.ejs`
- `plugins/ot-dashboard/public/views/index.ejs`
- `plugins/ot-dashboard/public/views/admin.ejs`
- `plugins/ot-dashboard/public/views/admin-shell.ejs`
- `plugins/ot-dashboard/public/views/my-transcripts.ejs`
- `plugins/ot-dashboard/public/global.css`
- `plugins/ot-dashboard/locales/english.json`
- `plugins/ot-dashboard/README.md`
- `plugins/ot-dashboard/test/app.test.ts`
- `plugins/ot-dashboard/test/editor-layout.test.ts`
- `plugins/ot-dashboard/test/home-setup.test.ts`
- `plugins/ot-dashboard/test/operational-pages.test.ts`

## Locked implementation decisions

- Create `public/assets/eotfs-dashboard-favicon.png` from `C:\Users\Administrator\Desktop\PoT\Bot\EoTFS Ticket Bot\Logo_dinosaur_herbivore_1.png` and point the dashboard brand config/defaults at that exact new asset.
- Do not render any shared in-page logo image in the header, rail, viewer host shell, or authenticated shell.
- Remove the shared `dashboardName` kicker so shared header/rail identity is title-only.
- Remove every visible dashboard footer surface, but preserve the hidden shared UI message payload needed by `dashboard-ui.js`.
- Remove visible `Health` links from the landing page, legacy admin surface, and authenticated utility rail in this slice.
- Keep `/health` itself unchanged and reachable directly.

## Required changes

- Add `public/assets/eotfs-dashboard-favicon.png` and retire all E4 favicon references in config defaults, brand resolution, and tests.
- Update the shared head and Express app bootstrap so the new favicon path is used consistently by both page markup and `serve-favicon`.
- Flatten the shared header into a text-only title treatment with no image and no duplicated name stack.
- Strip the visible footer markup, docs/support/vendor links, and visible footer copy from the shared footer include while preserving non-visual UI payload output for shared dialogs.
- Remove the remaining visible non-auth health shortcuts from shared and legacy dashboard pages.
- Remove or rewrite locale strings and README guidance that still describe the retired footer links, vendor credit, or visible dashboard health shortcuts.

## Verification for this slice

```bash
npm run build
node --test dist/plugins/ot-dashboard/test/app.test.js dist/plugins/ot-dashboard/test/home-setup.test.js dist/plugins/ot-dashboard/test/editor-layout.test.js dist/plugins/ot-dashboard/test/operational-pages.test.js
```
