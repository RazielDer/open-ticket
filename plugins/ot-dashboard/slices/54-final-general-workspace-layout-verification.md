# Slice 54: Final General Workspace Layout Verification

## Objective

Verify that the General workspace refinement improves layout flow and density without disturbing the existing editor contracts, routes, or matte visual system.

## Exact files

- `plugins/ot-dashboard/workflow.yaml`
- `plugins/ot-dashboard/workflow-ledger.yaml`
- `plugins/ot-dashboard/workflow.md`
- `plugins/ot-dashboard/active/active-slice.md`
- `plugins/ot-dashboard/runtime/controller-state.yaml`

## Locked implementation decisions

- Report exact command outcomes and browser/manual findings.
- Use the authenticated `127.0.0.1:3371/dash/visual/general` fixture route for live verification.
- Keep verification focused on `General`; do not widen scope into new editor features.

## Required changes

- Run the full build and node-test verification set.
- Browser-check `/dash/visual/general` at `1440x900` and `390x844`.
- Confirm the General page stays matte, shadow-free, and glow-free while improving section flow and mobile reachability.
- Update workflow and evidence files to close the follow-up.

## Final verification for this slice

```bash
npm run build
node --test dist/plugins/ot-dashboard/test/app.test.js dist/plugins/ot-dashboard/test/auth.test.js dist/plugins/ot-dashboard/test/home-setup.test.js dist/plugins/ot-dashboard/test/editor-layout.test.js dist/plugins/ot-dashboard/test/operational-pages.test.js dist/plugins/ot-dashboard/test/transcript-workspace.test.js
```

## Required browser/manual checks

- `http://127.0.0.1:3371/dash/visual/general` at `1440x900`
- `http://127.0.0.1:3371/dash/visual/general` at `390x844`

Verify:

- the General header stays matte and compact
- the desktop form uses the editor lane more efficiently than the earlier one-column stack
- the mobile navigation is denser and the advanced-tools tray stays collapsed by default
- the save surface no longer overlaps the main form
