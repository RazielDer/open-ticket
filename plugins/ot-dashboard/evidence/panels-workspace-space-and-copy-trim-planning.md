# Panels Workspace Space And Copy Trim Planning

## Objective

Refine `/visual/panels` again so it uses space more deliberately, removes redundant copy, and stays aligned with the matte dark login/admin shell without adding new workflow features.

## Live critique baseline

Authenticated fixture route: `http://127.0.0.1:3371/dash/visual/panels`

### Desktop `1440x900`

- Header: about `91px`
- Inventory rail card: about `327px`
- Top stage shell: about `287px`
- Summary strip: about `127px`
- Primary lane: about `502px`
- Builder lane: about `475px`
- Save row: about `114px`

### Mobile `390x844`

- Header: about `106px`
- Inventory stack: about `273px`
- Top stage shell: about `569px`
- Summary strip: about `287px`
- Primary lane: about `1241px`
- Builder lane: about `1190px`
- Save row: about `186px`

## Problems to solve

- The inventory still spends space on helper copy even though the list and `New panel` action already explain the path.
- The workspace title, summary strip, and save row still repeat obvious context through helper text instead of letting the controls speak.
- Identity, embed, picker, and preview each still open with another explanatory paragraph, which creates unnecessary vertical padding before the actual fields.
- The summary strip is still too tall because each card carries a second line that mostly repeats what the value already implies.
- The preview column still duplicates its purpose through extra section copy even though the preview panels themselves already communicate the result.

## Locked constraints

- Keep the existing Express + EJS architecture.
- Keep `/`, `/login`, `/health`, and `/admin` route paths unchanged.
- Preserve the existing Panels save route and submitted field names.
- Keep raw JSON, export, backup, review, and restore reachability unchanged.
- Keep the warm accent and matte dark shell.
- Do not add glow, blur, glossy gradients, or elevated shadow chrome.

## Implementation plan

1. Strip redundant inventory, stage, section, advanced, and save helper copy.
2. Collapse the summary strip to label/value cards only.
3. Tighten Panels-specific spacing in inventory rows, summary cards, preview cards, and the save row.
4. Keep picker/preview behavior intact while reducing copy duplication around those surfaces.
5. Verify the updated page against desktop/mobile fixture routes plus the locked test commands.

## Verification plan

- Slice 65:
  - `npm run build`
  - `node --test dist/plugins/ot-dashboard/test/editor-layout.test.js dist/plugins/ot-dashboard/test/operational-pages.test.js`
- Slice 66:
  - `npm run build`
  - `node --test dist/plugins/ot-dashboard/test/app.test.js dist/plugins/ot-dashboard/test/auth.test.js dist/plugins/ot-dashboard/test/home-setup.test.js dist/plugins/ot-dashboard/test/editor-layout.test.js dist/plugins/ot-dashboard/test/operational-pages.test.js dist/plugins/ot-dashboard/test/transcript-workspace.test.js`
  - Browser/manual checks on `/dash/visual/panels` at `1440x900` and `390x844`
