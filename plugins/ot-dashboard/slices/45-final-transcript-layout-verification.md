# Slice 45: Final Transcript Layout Verification

## Objective

Finish the transcript decluttering follow-up with any minimum final polish still needed after slices 43 and 44, then run the full verification set and capture the evidence.

## Exact files

- `plugins/ot-dashboard/public/views/sections/transcripts.ejs`
- `plugins/ot-dashboard/public/global.css`
- `plugins/ot-dashboard/server/transcript-control-center.ts`
- `plugins/ot-dashboard/locales/english.json`
- `plugins/ot-dashboard/test/app.test.ts`
- `plugins/ot-dashboard/test/auth.test.ts`
- `plugins/ot-dashboard/test/home-setup.test.ts`
- `plugins/ot-dashboard/test/editor-layout.test.ts`
- `plugins/ot-dashboard/test/operational-pages.test.ts`
- `plugins/ot-dashboard/test/transcript-workspace.test.ts`

## Locked implementation decisions

- Keep scope centered on `/admin/transcripts` and any narrow transcript model hooks it needs.
- Preserve transcript detail behavior, filters, bulk actions, return-to links, and viewer route behavior.
- Capture exact command outcomes and browser/manual findings in the evidence note.

## Required changes

- Apply only the minimum final polish needed after slices 43 and 44.
- Run the full verification set.
- Repeat desktop/mobile browser checks on the transcript route and capture the meaningful outcomes.
- Update the controller-kernel artifacts and add the matching completion evidence note for this follow-up.

## Final verification for this slice

```bash
npm run build
node --test dist/plugins/ot-dashboard/test/app.test.js dist/plugins/ot-dashboard/test/auth.test.js dist/plugins/ot-dashboard/test/home-setup.test.js dist/plugins/ot-dashboard/test/editor-layout.test.js dist/plugins/ot-dashboard/test/operational-pages.test.js dist/plugins/ot-dashboard/test/transcript-workspace.test.js
```

## Required browser/manual checks

- `/admin/transcripts` or the equivalent authenticated transcript fixture route

At `1440x900` and `390x844`, verify:

- the transcript header no longer reads as another same-weight summary-card wall
- filtered summary and bulk actions no longer dominate the pre-table stack
- the records table becomes reachable sooner on both desktop and stacked/mobile layouts
- operations still remain reachable, but read as a secondary analysis section
- the shell remains matte, shadow-free, and visually aligned with `/login`
