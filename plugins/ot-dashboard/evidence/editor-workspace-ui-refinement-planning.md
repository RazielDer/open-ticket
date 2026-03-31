# Editor Workspace UI Refinement Planning

## Intent

Prepare a focused follow-up pass for `General`, `Options`, `Panels`, and `Questions` that tightens proportions, reduces oversized control stacks, and improves card hierarchy without widening scope beyond the existing editor workspaces.

## Repo-grounded findings

- A fresh browser audit of `/visual/general`, `/visual/options`, `/visual/panels`, and `/visual/questions` at `1440x900` showed the shared editor shell still spends too much vertical budget on chrome: the shared header renders at roughly `279-303px`, the summary grids land around `199-223px` per card, and the sticky save bars still read as `188-196px` slabs.
- The current desktop split is still slightly over-wide for the flatter login reference. At `1440px`, the workspace spans about `1385px` with a `320px` sidebar, which makes the header and top cards feel broader than the calmer `/login` surface.
- On `390x844`, the first editable form section now arrives much earlier than the pre-slice-28 baseline, but the pages still stack a `268px` header, a `325-450px` inventory card, and a full-width action-button pattern before the main form. The first form starts around `1122-1247px`, so there is still room to compress the shell.
- On stacked/mobile widths, the top toolbars become unnecessarily tall because every action button expands to the full available width. `Duplicate`, reorder controls, and delete each consume their own row before the first fields.
- The options, panels, and questions workspaces still repeat some titles inside item-card headers via duplicated kicker text (`Assigned questions`, `Referenced by options`, `Selected options`, `Member-facing summary`) even when the heading already communicates the same label.

## Locked decisions

- Keep the scope inside `plugins/ot-dashboard/**`.
- Keep the existing Express + EJS architecture, route paths, save payloads, reorder behavior, auth flow, CSRF enforcement, and raw JSON reachability unchanged.
- Keep the login page as the visual reference surface.
- Keep the matte black direction and warm accent; do not introduce glow, blur, glossy gradients, or elevated-shadow chrome.
- Treat this as a density and hierarchy pass, not a feature pass: preserve warnings, advanced actions, and transcripts behavior unless a shared primitive needs a narrow compatibility adjustment.
- Prefer shared-shell refinements first, then only the minimum page-specific copy/markup trims needed to make the four workspaces feel calmer and better proportioned.

## Slice map

1. `31-shared-workspace-proportion-and-control-sizing`
   - Tighten the shared workspace proportions, header/stat sizing, sidebar density, save-bar structure, and stacked/mobile action grouping.
2. `32-editor-card-compaction-and-copy-tuning`
   - Remove duplicate micro-headings, shorten the most space-wasting helper text, and trim card copy where it is inflating the layout without adding new meaning.
3. `33-final-ui-refinement-verification`
   - Run the full verification set, repeat desktop/mobile browser checks, and capture the final evidence for the refinement pass.

## Verification contract

- Slice verification:
  - `npm run build`
  - `node --test dist/plugins/ot-dashboard/test/editor-layout.test.js dist/plugins/ot-dashboard/test/app.test.js`
- Final verification:
  - `npm run build`
  - `node --test dist/plugins/ot-dashboard/test/app.test.js dist/plugins/ot-dashboard/test/auth.test.js dist/plugins/ot-dashboard/test/home-setup.test.js dist/plugins/ot-dashboard/test/editor-layout.test.js`
  - Browser/manual checks on `/dash/visual/general`, `/dash/visual/options`, `/dash/visual/panels`, and `/dash/visual/questions` at `1440x900` and `390x844`
