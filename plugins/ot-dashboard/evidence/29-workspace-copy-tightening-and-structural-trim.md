# Workspace Copy Tightening And Structural Trim

## Intent

Remove the duplicated helper and meta language that remained in `General`, `Options`, `Panels`, and `Questions` after the slice-28 shell cleanup, while leaving warnings, advanced actions, and raw JSON reachability intact.

## Changes applied

- Removed the remaining stat-card detail copy from the shared workspace headers so the page subtitle remains the single top-level descriptive sentence.
- Tightened the shared General navigation/save copy to direct operator language instead of repeating advanced-tool or implementation-contract guidance.
- Removed the `Primary editor` kicker from the top editor cards on `Options`, `Panels`, and `Questions`.
- Rewrote the top editor-card helper copy on `Options`, `Panels`, and `Questions` so it focuses on the active edit context rather than repeating that raw JSON lives in advanced tools.
- Rewrote the four save-bar helper strings so they describe saving the current workspace state instead of exposing internal route or payload stability notes to end users.
- Updated route/layout tests so the old duplicated strings are explicitly absent from the rendered workspace HTML.

## Verification completed

- `npm run build`
- `node --test dist/plugins/ot-dashboard/test/editor-layout.test.js dist/plugins/ot-dashboard/test/app.test.js`

## Behavior evidence

- The four in-scope workspaces now render only the title/subtitle pair at the top of the page; the file and current-item stat cards no longer repeat the same descriptive copy.
- `Options`, `Panels`, and `Questions` no longer render the `Primary editor` kicker and no longer tell operators that raw JSON or payload-shape guidance belongs in the top editor card.
- Warning copy, dependency summaries, advanced-tool actions, and raw JSON reachability stayed intact while the repeated helper/meta language was removed.
