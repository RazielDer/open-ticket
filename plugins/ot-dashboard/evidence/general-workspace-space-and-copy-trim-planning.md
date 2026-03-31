# General Workspace Space And Copy Trim Planning

## Objective

Refine `/visual/general` again so it uses space more deliberately, removes redundant copy, and stays aligned with the matte dark login/admin shell without adding new workflow features.

## Live critique baseline

Authenticated fixture route: `http://127.0.0.1:3371/dash/visual/general`

### Desktop `1440x900`

- Header: about `91px`
- Sidebar: about `1732px`
- Connection section: about `547px`
- `Status / Logs / Limits` band: about `715px`
- Advanced section: about `596px`
- Save row: about `114px`

### Mobile `390x844`

- Header: about `83px`
- Sidebar stack: about `526px`
- Connection section: about `771px`
- `Status / Logs / Limits` band: about `1266px`
- Advanced section: about `931px`
- Save row: about `168px`

## Problems to solve

- The header still wastes its second stat on section count instead of current operating context.
- The sidebar still repeats obvious context through `Workspace navigation` plus `Jump to a section`.
- The connection section still reads taller than the fields require because command-mode controls sit as another full-width block below the inputs.
- The support band still reads like another vertical stack because `Status` spans one row and pushes `Logs` and `Limits` beneath it.
- Advanced disclosure summaries still repeat too much guidance for controls that are already clearly labeled.
- The save row still repeats the action text even though the button and section position already communicate the action.

## Locked constraints

- Keep the existing Express + EJS architecture.
- Keep `/`, `/login`, `/health`, and `/admin` route paths unchanged.
- Preserve the existing General save route and submitted field names.
- Keep raw JSON, export, backup, review, and restore reachability unchanged.
- Keep the warm accent and matte dark shell.
- Do not add glow, blur, glossy gradients, or elevated shadow chrome.

## Implementation plan

1. Replace the General header’s redundant section-count stat with live command-entry context.
2. Shorten sidebar navigation copy and labels so the section rail stops repeating its own purpose.
3. Rebuild the connection stage into a denser two-lane layout with command modes beside the main fields instead of below them.
4. Rebalance `Status`, `Logs`, and `Limits` into a split desktop band that uses the editor lane more efficiently.
5. Trim advanced disclosure and save-row copy to only the lines that still add meaning.

## Verification plan

- Slice 61:
  - `npm run build`
  - `node --test dist/plugins/ot-dashboard/test/editor-layout.test.js dist/plugins/ot-dashboard/test/operational-pages.test.js`
- Slice 62:
  - `node --test dist/plugins/ot-dashboard/test/app.test.js dist/plugins/ot-dashboard/test/auth.test.js dist/plugins/ot-dashboard/test/home-setup.test.js dist/plugins/ot-dashboard/test/editor-layout.test.js dist/plugins/ot-dashboard/test/operational-pages.test.js dist/plugins/ot-dashboard/test/transcript-workspace.test.js`
  - Browser/manual checks on `/dash/visual/general` at `1440x900` and `390x844`
