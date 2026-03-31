# Slice 56: Final Options Workspace Layout Verification

## Objective

Verify that the Options refinement improves layout flow, correctly hides inactive option-type sections, and preserves the existing workspace behavior.

## Exact files

- `plugins/ot-dashboard/workflow.yaml`
- `plugins/ot-dashboard/workflow-ledger.yaml`
- `plugins/ot-dashboard/workflow.md`
- `plugins/ot-dashboard/active/active-slice.md`
- `plugins/ot-dashboard/runtime/controller-state.yaml`

## Locked implementation decisions

- Report exact command outcomes and browser/manual findings.
- Use the authenticated `127.0.0.1:3371/dash/visual/options` fixture route for live verification.
- Verify both default ticket editing and in-page type switching so the hidden-section fix is proven in the browser.

## Required changes

- Run the full build and node-test verification set.
- Browser-check `/dash/visual/options` at `1440x900` and `390x844`.
- Confirm that inactive option-type sections now hide correctly, the save surface no longer overlaps the form, and the shell stays matte and glow-free.
- Update workflow and evidence files to close the follow-up.

## Final verification for this slice

```bash
npm run build
node --test dist/plugins/ot-dashboard/test/app.test.js dist/plugins/ot-dashboard/test/auth.test.js dist/plugins/ot-dashboard/test/home-setup.test.js dist/plugins/ot-dashboard/test/editor-layout.test.js dist/plugins/ot-dashboard/test/operational-pages.test.js dist/plugins/ot-dashboard/test/transcript-workspace.test.js
```

## Required browser/manual checks

- `http://127.0.0.1:3371/dash/visual/options` at `1440x900`
- `http://127.0.0.1:3371/dash/visual/options` at `390x844`

Verify:

- the page stays matte, shadow-free, and glow-free
- the top stage is calmer than the prior toolbar-summary-save stack
- the selected `ticket` option no longer shows the `Website` and `Role` sections
- switching the type to `website` and `role` swaps the visible editor sections correctly
