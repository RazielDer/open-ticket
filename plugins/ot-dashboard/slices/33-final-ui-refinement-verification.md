# Slice 33: Final UI Refinement Verification

## Objective

Finish the workspace refinement pass with the minimum final polish needed after slices 31 and 32, then run the full verification set and capture completion evidence.

## Exact files

- `plugins/ot-dashboard/public/global.css`
- `plugins/ot-dashboard/public/views/config-general.ejs`
- `plugins/ot-dashboard/public/views/config-options.ejs`
- `plugins/ot-dashboard/public/views/config-panels.ejs`
- `plugins/ot-dashboard/public/views/config-questions.ejs`
- `plugins/ot-dashboard/public/views/partials/editor-workspace-header.ejs`
- `plugins/ot-dashboard/public/views/partials/editor-advanced-tools.ejs`
- `plugins/ot-dashboard/locales/english.json`
- `plugins/ot-dashboard/test/editor-layout.test.ts`
- `plugins/ot-dashboard/test/app.test.ts`
- `plugins/ot-dashboard/test/auth.test.ts`
- `plugins/ot-dashboard/test/home-setup.test.ts`

## Locked implementation decisions

- Keep the scope inside the shared editor shell and the four in-scope workspace pages.
- Preserve auth, CSRF, raw JSON access, reorder behavior, save payloads, warnings, advanced actions, and transcript behavior.
- Use the login page as the final visual reference surface.
- Capture exact command output and browser/manual outcomes in the evidence note.

## Required changes

- Apply only the minimum final polish needed after slices 31 and 32.
- Run the full test set.
- Repeat the desktop/mobile browser audit on the four workspaces and capture the meaningful before/after outcomes.
- Update the controller-kernel artifacts and add the matching completion evidence note for this follow-up pass.

## Final verification for this slice

```bash
npm run build
node --test dist/plugins/ot-dashboard/test/app.test.js dist/plugins/ot-dashboard/test/auth.test.js dist/plugins/ot-dashboard/test/home-setup.test.js dist/plugins/ot-dashboard/test/editor-layout.test.js
```

## Required browser/manual checks

- `/dash/visual/general`
- `/dash/visual/options`
- `/dash/visual/panels`
- `/dash/visual/questions`

At `1440x900` and `390x844`, verify:

- shared header and stat blocks feel denser and calmer than the prior state
- the inventory remains visible
- the advanced-tools tray is open on desktop and collapsed by default on stacked/mobile layouts
- stacked/mobile toolbars no longer force every editor action into a full-width single-column stack
- save bars read as compact commit surfaces rather than full content slabs
- warnings and advanced actions remain reachable
