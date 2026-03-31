# Slice 52: Final Tickets Surface Retirement Verification

## Objective

Verify that the Tickets page is gone as a first-class admin surface, historical links redirect safely, and the dashboard still exposes ticket summary signals where they remain useful.

## Exact files

- `plugins/ot-dashboard/workflow.yaml`
- `plugins/ot-dashboard/workflow-ledger.yaml`
- `plugins/ot-dashboard/workflow.md`
- `plugins/ot-dashboard/active/active-slice.md`
- `plugins/ot-dashboard/runtime/controller-state.yaml`

## Locked implementation decisions

- Keep the retirement scope narrow: route/nav/template/copy/docs/tests only.
- Report exact command outcomes and browser/manual findings.
- Use an authenticated fixture route when `127.0.0.1:3360` cannot be automated directly.

## Required changes

- Run the build and node-test verification set.
- Browser-check `/admin` and `/admin/tickets` on an authenticated dashboard runtime.
- Confirm that the Tickets rail item is gone and `/admin/tickets` lands on Home safely.
- Update workflow/evidence files to close the retirement follow-up.

## Final verification for this slice

```bash
npm run build
node --test dist/plugins/ot-dashboard/test/app.test.js dist/plugins/ot-dashboard/test/auth.test.js dist/plugins/ot-dashboard/test/home-setup.test.js dist/plugins/ot-dashboard/test/editor-layout.test.js dist/plugins/ot-dashboard/test/operational-pages.test.js dist/plugins/ot-dashboard/test/transcript-workspace.test.js
```

## Required browser/manual checks

- `/admin` or an equivalent authenticated fixture route
- `/admin/tickets` or an equivalent authenticated fixture route

Verify:

- the primary rail no longer lists `Tickets`
- `/admin/tickets` redirects to `/admin`
- Home still shows tracked ticket summary data in the overview/status surfaces
