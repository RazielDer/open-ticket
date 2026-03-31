# Slice 48: Final Transcript Surface Polish Verification

## Objective

Finish the transcript surface-polish follow-up with any minimal final adjustment still needed, then run the full verification set and close the workflow artifacts.

## Exact files

- `plugins/ot-dashboard/public/views/sections/transcripts.ejs`
- `plugins/ot-dashboard/public/global.css`
- `plugins/ot-dashboard/locales/english.json`
- `plugins/ot-dashboard/test/app.test.ts`
- `plugins/ot-dashboard/test/auth.test.ts`
- `plugins/ot-dashboard/test/home-setup.test.ts`
- `plugins/ot-dashboard/test/editor-layout.test.ts`
- `plugins/ot-dashboard/test/operational-pages.test.ts`
- `plugins/ot-dashboard/test/transcript-workspace.test.ts`

## Locked implementation decisions

- Keep scope centered on `/admin/transcripts` and any narrow transcript helper/test adjustments it needs.
- Report exact command outcomes and browser/manual findings instead of broad pass/fail summaries.
- Use the equivalent authenticated transcript fixture when `127.0.0.1:3360` is unavailable to automation.

## Required changes

- Apply only the minimum final polish still needed after slices 46 and 47.
- Run the full verification set.
- Repeat desktop/mobile browser checks on the transcript route and capture the meaningful outcomes.
- Update the workflow, ledger, runtime state, active slice pointer, and evidence files to close the follow-up.

## Final verification for this slice

```bash
npm run build
node --test dist/plugins/ot-dashboard/test/app.test.js dist/plugins/ot-dashboard/test/auth.test.js dist/plugins/ot-dashboard/test/home-setup.test.js dist/plugins/ot-dashboard/test/editor-layout.test.js dist/plugins/ot-dashboard/test/operational-pages.test.js dist/plugins/ot-dashboard/test/transcript-workspace.test.js
```

## Required browser/manual checks

- `/admin/transcripts` or the equivalent authenticated transcript fixture route

At `1440x900` and `390x844`, verify:

- the transcript shell reads flatter and less nested before the table
- the closed `More filters` row feels lighter than a raised subsection card
- the filtered summary and bulk tools now read as part of the records flow
- the first table row becomes reachable earlier on both desktop and stacked/mobile layouts
- operations remain reachable, but stay visually secondary
- the shell remains matte, shadow-free, and aligned with `/login`
