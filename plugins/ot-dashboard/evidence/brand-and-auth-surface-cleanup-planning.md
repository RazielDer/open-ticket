# Brand And Auth Surface Cleanup Planning

## Objective

Replace the remaining E4/vendor dashboard identity with EoTFS dinosaur branding, remove footer and health clutter from the dashboard UI, and simplify the admin and viewer auth surfaces without changing auth, routing, or transcript-access behavior.

## Repo-grounded findings

- `public/views/partials/footer.ejs` currently renders both the visible footer links/copy and the hidden `dashboard-ui-messages` payload consumed by `public/js/dashboard-ui.js`, so deleting the footer markup blindly would break shared confirm/dialog behavior.
- The dashboard favicon is delivered in two places: `public/views/partials/head.ejs` emits the page `<link rel="icon">`, and `server/create-app.ts` registers `serve-favicon`, so both paths must change together.
- `public/js/login.js` only exists to power the public `Check health` button and hidden inline status region on `/login`.
- Visible health shortcuts still exist outside `/login`, including the landing/admin shells in `public/views/index.ejs`, `public/views/admin.ejs`, and `public/views/admin-shell.ejs`.
- `public/views/transcript-viewer-login.ejs` still renders the shared header plus the `What happens next`, `Private access`, and `Separate session` cards the user explicitly wants removed.
- The shared header still supports a logo image and duplicated name stack (`dashboardName` kicker plus `brand.title`), which is where shared in-page logo treatment would reappear if this pass is not explicit.
- The provided source art files `Logo_dinosaur_herbivore_1.png` and `Logo_dinosaur_ver_2.png` are both `2970x2331` `Format32bppArgb`, so they can be used as transparent-source inputs for dashboard-local assets.
- `ot-html-transcripts` has its own independent favicon pipeline, but the current request is scoped to `plugins/ot-dashboard/**` unless implementation-time verification proves the E4 mark still leaks through dashboard-served transcript pages.

## Locked decisions

- Use `Logo_dinosaur_herbivore_1.png` only as the source for `plugins/ot-dashboard/public/assets/eotfs-dashboard-favicon.png`; do not show that image inside the page chrome.
- Use `Logo_dinosaur_ver_2.png` only as the source for `plugins/ot-dashboard/public/assets/eotfs-login-hero.png`; do not reuse it on the viewer login, shared header, or authenticated shell.
- Use new dashboard-local asset filenames for the favicon and login hero art so browser caches do not keep showing the E4 icon.
- Keep the shared dashboard chrome text-only: no shared logo image, no duplicated dashboard-name kicker, no vendor footer, and no docs/support/credit footer links.
- Remove every visible dashboard `Health` / `Check health` shortcut, but keep the `/health` route itself working for direct operational use.
- Keep `public/views/partials/footer.ejs` as a non-visual shared UI payload include if needed, but remove all visible footer DOM from rendered pages in this pass.
- Keep admin and viewer OAuth behavior, `returnTo` handling, host-family redirects, session scopes, and transcript-access logic unchanged.
- Keep all changed user-facing copy locale-backed in `locales/english.json`.
- Use the live local dashboard for browser verification when available; otherwise use the equivalent local fixture routes already established in the dashboard tests.

## Slice map

1. `69-shared-brand-favicon-and-footer-cleanup`
2. `70-auth-surface-simplification-and-health-shortcut-removal`
3. `71-final-brand-and-auth-surface-cleanup-verification`
