# Slice 27: Home Card Cutover And Legacy Route Redirects

## Objective

Finish the redesign by cutting Home over to direct workspace entry, redirecting the legacy config-detail routes for the four in-scope areas, and updating docs/tests.

## Exact files

- `plugins/ot-dashboard/public/views/sections/overview.ejs`
- `plugins/ot-dashboard/server/home-setup-models.ts`
- `plugins/ot-dashboard/server/routes/admin.ts`
- `plugins/ot-dashboard/server/routes/pages.ts`
- `plugins/ot-dashboard/public/views/sections/config-detail.ejs` if transcript-only behavior needs a narrow compatibility adjustment
- `plugins/ot-dashboard/locales/english.json`
- `plugins/ot-dashboard/README.md`
- `plugins/ot-dashboard/test/app.test.ts`
- `plugins/ot-dashboard/test/home-setup.test.ts`
- `plugins/ot-dashboard/test/editor-layout.test.ts`

## Locked implementation decisions

- Home setup cards point directly to `/visual/general`, `/visual/options`, `/visual/panels`, and `/visual/questions`.
- `/admin/configs/general|options|panels|questions` redirect to `/visual/:id`.
- `Transcripts` keeps its current detail-route behavior in this pass.
- Do not cut over until workspace advanced-tool parity exists.
- README and workflow-facing docs must describe the workspace-first model accurately.

## Required changes

- Update Home-card primary actions and supporting copy to match direct workspace entry.
- Redirect only the four in-scope legacy detail routes.
- Keep raw review/restore/export routes reachable from the new workspaces.
- Update route and editor tests to match the final cutover behavior.

## Verification for this slice

```bash
npm run build
node --test dist/plugins/ot-dashboard/test/app.test.js dist/plugins/ot-dashboard/test/auth.test.js dist/plugins/ot-dashboard/test/home-setup.test.js dist/plugins/ot-dashboard/test/editor-layout.test.js
```
