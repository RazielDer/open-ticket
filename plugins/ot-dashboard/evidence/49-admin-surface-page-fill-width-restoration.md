# Slice 49 Evidence: Admin Surface Page Fill Width Restoration

## Changes

- Removed the dedicated add-ons page content cap so `/admin/plugins` now inherits the admin shell's full content track.
- Removed the dedicated transcript page content cap so `/admin/transcripts` now uses the same available shell width.
- Kept the change constrained to the shared admin CSS in `public/global.css`; routes, templates, copy, and behaviors were unchanged.

## Verification

- `npm run build`
  - Outcome: compile-only build succeeded with `OT: Compilation Succeeded!`
- `node --test dist/plugins/ot-dashboard/test/app.test.js dist/plugins/ot-dashboard/test/auth.test.js dist/plugins/ot-dashboard/test/home-setup.test.js dist/plugins/ot-dashboard/test/editor-layout.test.js dist/plugins/ot-dashboard/test/operational-pages.test.js dist/plugins/ot-dashboard/test/transcript-workspace.test.js`
  - Outcome: `53` tests passed, `0` failed.
