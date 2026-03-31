# Slice 06: Accessibility, Responsive Hardening, Regression Coverage, and Cutover

## Objective

Finish the refactor with accessibility, responsive, cleanup, and repo-native proof that the redesign did not break behavior.

## Exact files

- `plugins/ot-dashboard/public/global.css`
- `plugins/ot-dashboard/public/js/dashboard-ui.js`
- `plugins/ot-dashboard/public/js/control-center.js`
- `plugins/ot-dashboard/test/app.test.ts`
- `plugins/ot-dashboard/test/auth.test.ts`
- `plugins/ot-dashboard/test/home-setup.test.ts`
- `plugins/ot-dashboard/test/operational-pages.test.ts`
- `plugins/ot-dashboard/test/editor-layout.test.ts`
- `plugins/ot-dashboard/test/route-copy.test.ts`
- `plugins/ot-dashboard/test/transcript-workspace.test.ts`
- `plugins/ot-dashboard/workflow.yaml`
- `plugins/ot-dashboard/workflow-ledger.yaml`
- `plugins/ot-dashboard/workflow.md`
- `plugins/ot-dashboard/active/active-slice.md`
- `plugins/ot-dashboard/runtime/controller-state.yaml`
- `plugins/ot-dashboard/evidence/`

## Locked implementation decisions

- Breakpoints are fixed:
  - `1100px`: rail collapses above content
  - `900px`: side rails and split workspaces collapse to one column
  - `720px`: summary, card, and list grids collapse to one column
- Focus rings stay visible on links, buttons, inputs, selects, and disclosure controls.
- Disabled actions remain readable and the reason remains discoverable.

## Required work

- In `public/global.css`:
  - finish the responsive rules at the locked breakpoints
  - remove dead selectors, duplicate shadows, duplicate radii, and any leftover pale-surface styling
- In `dashboard-ui.js` / `control-center.js`:
  - only add behavior if the new disclosure patterns or focus flows need it
  - do not add ornamental motion
- In tests:
  - finish route, nav, setup-state, operational-page, editor-layout, transcript-workspace, and route-copy coverage
  - add or keep checks that no new UI copy is hardcoded in route handlers
- In workflow docs:
  - move the controller-kernel state from `ready` / `pending` to `completed`
  - record final evidence under `evidence/`

## Final verification

```bash
npm --prefix plugins/ot-dashboard run build:editor
npm run build
node --test dist/plugins/ot-dashboard/test
node --test dist/plugins/ot-html-transcripts/test
```

## Done when

- The full verification set passes.
- The controller-kernel artifacts reflect completion.
- The shipped dashboard feels dark, restrained, readable, and operationally clear across desktop and compressed layouts.
