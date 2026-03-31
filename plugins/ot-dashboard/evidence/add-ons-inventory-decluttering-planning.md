# Add-ons Inventory Decluttering Planning

## Intent

Prepare a focused follow-up pass for `/admin/plugins` so the inventory stops reading as one clustered wall when many add-ons are installed, while staying in the same matte-black product family as `/login`.

## Repo-grounded findings

- On March 28, 2026, `http://127.0.0.1:3360/admin/plugins` was not listening from the automation environment, so the authenticated fixture route at `/dash/admin/plugins` remained the reliable browser verification surface for this pass.
- An authenticated fixture audit at `1440x900` showed the page still renders 18 add-ons in one equal-weight grid, which makes the surface scan like a single mixed catalog instead of an operator inventory.
- The current card anatomy stacks title, status, description, three boxed metadata facts, JSON preview chips, tag chips, and actions inside every card. The nested fact boxes are the main source of the clustered feel.
- The visible `Source` fact is usually redundant because most entries on the audited surface report `Manifest only`, so repeating it on every inventory item adds noise without helping the operator choose the next action.
- Grouping the inventory by creator would overfit a large-plugin installation and fragment small inventories, while grouping by operational state aligns with the primary question the page should answer first: what needs attention versus what is simply present.

## Locked decisions

- Keep the scope inside `plugins/ot-dashboard/**`.
- Keep the existing Express + EJS architecture and the `/admin/plugins` and `/admin/plugins/:id` routes unchanged.
- Preserve auth, CSRF, plugin detail/workbench reachability, manifest export reachability, backup reachability, and plugin JSON workbench behavior.
- Keep the search client-side and progressive.
- Use `/login` as the visual reference surface for spacing, restraint, and matte-black tone.
- Group the inventory by operational state instead of creator, author, or tag buckets.
- Prefer flatter row-like inventory items over nested metadata boxes when the inventory is large.
- Trim only metadata that is redundant on the main list; preserve author visibility, JSON preview reachability, status, and the workbench/export actions.

## Slice map

1. `37-add-ons-inventory-grouping-and-layout-decluttering`
   - Group the inventory by operational state, add section headings/counts, and keep filtered search behavior coherent across groups.
2. `38-add-ons-metadata-trim-and-row-compaction`
   - Flatten the per-item layout, trim redundant list metadata, and keep the remaining inventory details calm and legible on desktop/mobile.
3. `39-final-add-ons-decluttering-verification`
   - Run build, targeted tests, and desktop/mobile browser checks for the decluttered inventory, then capture the completion evidence.

## Verification contract

- Slice verification:
  - `npm run build`
  - `node --test dist/plugins/ot-dashboard/test/app.test.js dist/plugins/ot-dashboard/test/operational-pages.test.js`
- Final verification:
  - `npm run build`
  - `node --test dist/plugins/ot-dashboard/test/app.test.js dist/plugins/ot-dashboard/test/auth.test.js dist/plugins/ot-dashboard/test/home-setup.test.js dist/plugins/ot-dashboard/test/editor-layout.test.js dist/plugins/ot-dashboard/test/operational-pages.test.js`
  - Browser/manual checks on `/dash/admin/plugins` at `1440x900` and `390x844`
