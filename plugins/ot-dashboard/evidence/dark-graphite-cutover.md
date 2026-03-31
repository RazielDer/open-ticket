# Dark Graphite Cutover Evidence

Date: 2026-03-25

## Scope outcome

- Completed slices 01 through 06 of the OT Dashboard dark graphite refactor entirely inside `plugins/ot-dashboard/**`.
- Kept the existing Express + EJS architecture, route paths, config POST targets, submitted field names, transcript operations, plugin workbenches, and Advanced access to Runtime and Evidence intact.
- Shipped one dark graphite token system, guided Home and Setup surfaces, restrained entry pages, and common-first visual editors backed by locale copy.

## Final proof

- The primary admin nav remains `Home`, `Setup`, `Tickets`, `Transcripts`, `Add-ons`, and `Advanced`.
- `/admin/runtime` and `/admin/evidence` remain live through Advanced rather than the primary nav.
- The Home page still exposes health, next action, setup status, daily operations, and warnings in one scan.
- Setup cards and daily-operation cards remain visually distinct.
- Transcript destructive actions remain on transcript detail pages only.
- Advanced JSON, preview/apply, transcript workspace, and plugin workbench flows remain covered by the passing dashboard suite.

## Final verification

- PASS `npm --prefix plugins/ot-dashboard run build:editor`
- PASS `npm run build`
- PASS `node --test dist/plugins/ot-dashboard/test`
  - Result: 47 tests passed, 0 failed.
- PASS `node --test dist/plugins/ot-html-transcripts/test`
  - Result: 24 tests passed, 0 failed.

## Notes

- Landing and login now use the same dark graphite system as the authenticated dashboard while keeping operational, non-marketing copy.
- The five visual editors present common settings first and keep advanced settings secondary without changing save contracts.
