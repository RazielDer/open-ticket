# Options Workspace Space And Copy Trim Planning

## Objective

Refine `/visual/options` again so it uses space more deliberately, removes redundant copy, and stays aligned with the matte dark login/admin shell without adding new workflow features.

## Live critique baseline

Authenticated fixture route: `http://127.0.0.1:3371/dash/visual/options`

### Desktop `1440x900`

- Header: about `91px`
- Inventory rail card: about `472px`
- Top stage shell: about `238px`
- Summary strip: about `109px`
- Save row: about `114px`

### Mobile `390x844`

- Header: about `106px`
- Inventory stack: about `443px`
- Top stage shell: about `245px`
- Summary strip: about `269px`
- Reference warning: about `178px`
- Save row: about `186px`

## Problems to solve

- The inventory still spends space on helper copy and leaks noisy button-emoji text into the operator-facing list.
- The workspace title, summary strip, warning slab, and dependency-card body copy still repeat context before the main form.
- The panel-reference warning belongs with dependency context instead of competing in the top stage.
- Identity and dependency still read as another full-width vertical stack before the ticket builder starts.
- Ticket, website, role, and save subsections still spend height on paragraphs that mostly restate the visible headings or actions.

## Locked constraints

- Keep the existing Express + EJS architecture.
- Keep `/`, `/login`, `/health`, and `/admin` route paths unchanged.
- Preserve the existing Options save route and submitted field names.
- Keep raw JSON, export, backup, review, and restore reachability unchanged.
- Keep the warm accent and matte dark shell.
- Do not add glow, blur, glossy gradients, or elevated shadow chrome.

## Implementation plan

1. Strip redundant inventory and stage helper copy while simplifying inventory rows to name, type, and ID.
2. Collapse the summary strip to label/value cards only and move the panel-reference warning into the dependency section.
3. Rebalance identity and dependency into a shared support lane on desktop so the page stops reading like another long full-width stack.
4. Remove ticket, website, role, and save copy that only repeats visible headings while keeping field-level transcript/help text intact.
5. Verify the updated page against desktop/mobile fixture routes plus the locked test commands.

## Verification plan

- Slice 63:
  - `npm run build`
  - `node --test dist/plugins/ot-dashboard/test/editor-layout.test.js dist/plugins/ot-dashboard/test/operational-pages.test.js`
- Slice 64:
  - `npm run build`
  - `node --test dist/plugins/ot-dashboard/test/app.test.js dist/plugins/ot-dashboard/test/auth.test.js dist/plugins/ot-dashboard/test/home-setup.test.js dist/plugins/ot-dashboard/test/editor-layout.test.js dist/plugins/ot-dashboard/test/operational-pages.test.js dist/plugins/ot-dashboard/test/transcript-workspace.test.js`
  - Browser/manual checks on `/dash/visual/options` at `1440x900` and `390x844`
