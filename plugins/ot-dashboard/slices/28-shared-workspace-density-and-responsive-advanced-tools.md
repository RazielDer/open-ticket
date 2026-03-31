# Slice 28: Shared Workspace Density And Responsive Advanced Tools

## Objective

Tighten the shared editor shell so it stops repeating the page title, drops the redundant advanced-tools stat, and collapses the advanced-tools tray by default once the workspace stacks.

## Exact files

- `plugins/ot-dashboard/public/views/partials/editor-workspace-header.ejs`
- `plugins/ot-dashboard/public/views/partials/editor-advanced-tools.ejs`
- `plugins/ot-dashboard/public/views/config-general.ejs`
- `plugins/ot-dashboard/public/views/config-options.ejs`
- `plugins/ot-dashboard/public/views/config-panels.ejs`
- `plugins/ot-dashboard/public/views/config-questions.ejs`
- `plugins/ot-dashboard/public/global.css`
- `plugins/ot-dashboard/public/js/dashboard-ui.js`
- `plugins/ot-dashboard/test/editor-layout.test.ts`
- `plugins/ot-dashboard/test/app.test.ts`

## Locked implementation decisions

- Use the existing login page as the visual reference surface; do not introduce a new palette.
- Suppress the shared workspace eyebrow when it duplicates the page title for these four workspaces.
- Reduce the shared workspace stats from three cards to two: keep `File` and `Current items`, remove the `Advanced tools` stat card.
- Keep the inventory always visible.
- Convert the advanced-tools tray into a shared outer disclosure.
- Keep the nested `Review JSON before apply` disclosure inside the tray.
- Desktop default: advanced-tools tray open.
- Stacked/mobile default: advanced-tools tray closed.
- Use `dashboard-ui.js` for the responsive default-open/default-closed initialization.
- Do not persist tray state across reloads.
- The responsive switch point is the existing stacked-workspace breakpoint at `max-width: 900px`.

## Required changes

- Update the four workspace header calls so the shared header no longer receives a duplicated eyebrow/title pair and no longer renders the third `Advanced tools` stat.
- Add a stable responsive-collapse hook to the outer advanced-tools tray disclosure so shared JS can initialize the open state.
- In `dashboard-ui.js`, initialize responsive disclosures on load:
  - leave them open above `900px`
  - close them on load at `900px` and below
  - do not override user interaction after the initial load
- Tighten shared header/stats CSS on stacked/mobile widths so the hero block is materially shorter without changing the desktop grid.
- Keep raw JSON, export, backup, review, and restore reachable inside the disclosure body.

## Verification for this slice

```bash
npm run build
node --test dist/plugins/ot-dashboard/test/editor-layout.test.js dist/plugins/ot-dashboard/test/app.test.js
```
