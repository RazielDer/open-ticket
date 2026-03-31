# Slice 50: Final Admin Surface Page Fill Verification

## Objective

Verify the page-fill follow-up on live rendered pages, capture the wide-desktop measurements, and close the workflow state for the add-ons/transcripts width restoration pass.

## Exact files

- `plugins/ot-dashboard/public/global.css`
- `plugins/ot-dashboard/workflow.yaml`
- `plugins/ot-dashboard/workflow-ledger.yaml`
- `plugins/ot-dashboard/workflow.md`
- `plugins/ot-dashboard/active/active-slice.md`
- `plugins/ot-dashboard/runtime/controller-state.yaml`

## Locked implementation decisions

- Keep the code scope narrow: shared admin CSS plus controller-kernel workflow artifacts only.
- Report exact command outcomes and browser/manual measurements.
- Use the equivalent authenticated fixture route when `127.0.0.1:3360` is unavailable to automation.

## Required changes

- Apply only the minimum final adjustment needed after slice 49.
- Run the build and node test verification set.
- Browser-check `/admin/plugins` and `/admin/transcripts` on wide desktop, normal desktop, and mobile.
- Update the workflow/evidence files to record the measured page-fill restoration.

## Final verification for this slice

```bash
npm run build
node --test dist/plugins/ot-dashboard/test/app.test.js dist/plugins/ot-dashboard/test/auth.test.js dist/plugins/ot-dashboard/test/home-setup.test.js dist/plugins/ot-dashboard/test/editor-layout.test.js dist/plugins/ot-dashboard/test/operational-pages.test.js dist/plugins/ot-dashboard/test/transcript-workspace.test.js
```

## Required browser/manual checks

- `/admin/plugins` or the equivalent authenticated fixture route
- `/admin/transcripts` or the equivalent authenticated fixture route

At `1920x1080`, `1440x900`, and `390x844`, verify:

- the pages use the full admin-shell content lane instead of route-specific narrow caps
- the shell stays matte and shadow-free
- the `1440x900` and mobile layouts remain stable after removing the wide-desktop caps
