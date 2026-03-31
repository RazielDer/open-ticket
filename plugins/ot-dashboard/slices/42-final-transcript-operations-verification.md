# Slice 42: Final Transcript Operations Verification

## Objective

Finish the `/admin/transcripts` refinement with any minimum final polish needed after slices 40 and 41, then run the final verification set and capture the evidence.

## Exact files

- `plugins/ot-dashboard/public/views/sections/transcripts.ejs`
- `plugins/ot-dashboard/public/global.css`
- `plugins/ot-dashboard/server/routes/admin.ts`
- `plugins/ot-dashboard/server/transcript-control-center.ts`
- `plugins/ot-dashboard/locales/english.json`
- `plugins/ot-dashboard/test/app.test.ts`
- `plugins/ot-dashboard/test/auth.test.ts`
- `plugins/ot-dashboard/test/home-setup.test.ts`
- `plugins/ot-dashboard/test/editor-layout.test.ts`
- `plugins/ot-dashboard/test/operational-pages.test.ts`
- `plugins/ot-dashboard/test/transcript-workspace.test.ts`

## Locked implementation decisions

- Keep the scope centered on `/admin/transcripts` and any narrow shared-shell hooks it needs.
- Preserve transcript detail behavior, destructive-action isolation on detail pages, bulk-action behavior, config/plugin reachability, and viewer route behavior.
- Capture exact command outcomes and browser/manual findings in the evidence note.

## Required changes

- Apply only the minimum final polish needed after slices 40 and 41.
- Run the full verification set.
- Repeat desktop/mobile browser checks on `/dash/admin/transcripts` and capture the meaningful outcomes.
- Update the controller-kernel artifacts and add the matching completion evidence note for this follow-up.

## Final verification for this slice

```bash
npm run build
node --test dist/plugins/ot-dashboard/test/app.test.js dist/plugins/ot-dashboard/test/auth.test.js dist/plugins/ot-dashboard/test/home-setup.test.js dist/plugins/ot-dashboard/test/editor-layout.test.js dist/plugins/ot-dashboard/test/operational-pages.test.js dist/plugins/ot-dashboard/test/transcript-workspace.test.js
```

## Required browser/manual checks

- `/dash/admin/transcripts`

At `1440x900` and `390x844`, verify:

- the page reads as one transcript workspace instead of a hero-plus-card wall
- filters stay reachable but collapse by default on stacked/mobile widths
- active filter state remains visible when the filter disclosure is collapsed
- transcript records are reachable earlier than before on stacked/mobile layouts
- the shell remains matte, shadow-free, and visually aligned with `/login`
