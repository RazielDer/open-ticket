# Home Card Cutover And Legacy Route Redirects

## Intent

Finish the core editor redesign by making Home the direct entry point into the new `General`, `Options`, `Panels`, and `Questions` workspaces while redirecting the matching legacy config-detail routes.

## Changes applied

- Updated Home setup cards so `General`, `Options`, `Panels`, and `Questions` open their `/visual/*` workspaces directly while keeping raw JSON as the secondary advanced action.
- Updated the workspace-first next-step actions so Home no longer points those four areas back through the legacy config-detail path.
- Redirected only `/admin/configs/general`, `/admin/configs/options`, `/admin/configs/panels`, and `/admin/configs/questions` to `/visual/:id`, preserving query strings and leaving transcripts on the existing detail-route flow.
- Updated locale-backed setup and next-step copy to match the workspace-first model.
- Updated route, home, and editor tests to lock the redirect behavior, Home-card targets, and advanced-tools parity expectations after the cutover.
- Updated plugin-facing docs so the route model and Home behavior match the implemented workspace-first flow.

## Verification completed

- `npm run build`
- `node --test dist/plugins/ot-dashboard/test/app.test.js dist/plugins/ot-dashboard/test/auth.test.js dist/plugins/ot-dashboard/test/home-setup.test.js dist/plugins/ot-dashboard/test/editor-layout.test.js`
- Browser/manual verification on:
  - `/dash/visual/general`
  - `/dash/visual/options`
  - `/dash/visual/panels`
  - `/dash/visual/questions`
  at `1440x900` and `390x844`

## Behavior evidence

- Home now renders `Open General workspace`, `Open Options workspace`, `Open Panels workspace`, and `Open Questions workspace` actions that point directly to `/dash/visual/*`.
- `/dash/admin/configs/general`, `/dash/admin/configs/options`, `/dash/admin/configs/panels`, and `/dash/admin/configs/questions` redirect to `/dash/visual/:id`, while `/dash/admin/configs/transcripts` still renders the transcript detail surface.
- The four redesigned workspaces still expose the advanced-tools tray with raw JSON, export, backup, review, and restore reachability after the Home cutover.
- Desktop checks confirmed the shared editor grid renders as a split sidebar-plus-main workspace, and mobile checks confirmed it collapses into a stacked flow without losing the page-specific controls for General, Options, Panels, or Questions.
