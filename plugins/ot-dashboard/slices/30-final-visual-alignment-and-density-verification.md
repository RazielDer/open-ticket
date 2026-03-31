# Slice 30: Final Visual Alignment And Density Verification

## Objective

Finish the density follow-up with any final shared-shell polish needed after implementation, then run the full verification set and capture completion evidence.

## Exact files

- `plugins/ot-dashboard/public/global.css`
- `plugins/ot-dashboard/public/views/partials/editor-workspace-header.ejs`
- `plugins/ot-dashboard/public/views/partials/editor-advanced-tools.ejs`
- `plugins/ot-dashboard/locales/english.json`
- `plugins/ot-dashboard/test/editor-layout.test.ts`
- `plugins/ot-dashboard/test/app.test.ts`
- `plugins/ot-dashboard/test/auth.test.ts`
- `plugins/ot-dashboard/test/home-setup.test.ts`

## Locked implementation decisions

- Keep the scope inside the shared editor shell and the four in-scope workspace pages.
- Use the login page as the final visual reference surface.
- Do not widen this slice into route changes, save-payload changes, inventory behavior changes, or transcript work.
- Preserve advanced-tools reachability, dependency warnings, and the current raw JSON escape hatch.

## Required changes

- Apply only the minimum final polish needed after slices 28 and 29 so the four workspaces match the intended shared density and visual restraint.
- Run the full test suite and browser/manual checks after the final polish.
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

- no glow, glossy gradient, or elevated-shadow regression in the editor shell
- the inventory remains visible
- the advanced-tools tray is open on desktop and collapsed by default on stacked/mobile layouts
- the main editor form is reachable on stacked/mobile without scrolling through the fully expanded advanced-tools tray
- warnings and advanced actions remain reachable
