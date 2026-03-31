# Shared Workspace Density And Responsive Advanced Tools

## Intent

Tighten the shared workspace shell so the four in-scope editors stop duplicating the page title, drop the redundant advanced-tools stat, and keep the advanced-tools tray collapsed by default only when the layout stacks.

## Changes applied

- Updated the shared workspace header partial so the eyebrow is suppressed when it only repeats the page title.
- Reduced the shared workspace stats on `General`, `Options`, `Panels`, and `Questions` from three cards to two by removing the advanced-tools stat card.
- Converted the advanced-tools tray into the shared outer disclosure while keeping the nested `Review JSON before apply` disclosure and every existing raw/export/backup/review/restore action inside the tray body.
- Added responsive disclosure initialization in `public/js/dashboard-ui.js` so the advanced-tools tray stays open on desktop and closes by default when the workspace loads at `900px` and below without persisting state across reloads.
- Tightened the shared stacked/mobile workspace spacing in `public/global.css` so the header, stats, sidebar, and disclosure chrome consume less vertical space before the main form.
- Updated route/layout tests to lock the no-eyebrow header output, the two-stat shell, and the shared responsive-disclosure hook.

## Verification completed

- `npm run build`
- `node --test dist/plugins/ot-dashboard/test/editor-layout.test.js dist/plugins/ot-dashboard/test/app.test.js`

## Behavior evidence

- `General`, `Options`, `Panels`, and `Questions` now render the shared header without a duplicated `hero-eyebrow` block and with only two `editor-workspace-stat` cards.
- The shared advanced-tools tray now renders as `<details ... data-responsive-disclosure="workspace-advanced-tools" open>` so desktop stays open by default while the shared client script can collapse it on stacked/mobile loads.
- Raw JSON, export, backup, review, and restore reachability stayed intact on all four workspaces after the shared disclosure conversion.
