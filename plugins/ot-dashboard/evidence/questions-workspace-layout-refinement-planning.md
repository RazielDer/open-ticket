# Questions Workspace Layout Refinement Planning

## Objective

Refine `/visual/questions` so it stops reading like a straight utility form, keeps the matte login-aligned look, and uses the editor lane more deliberately.

## Repo-grounded findings

- The Questions workspace still stacked usage, identity, advanced settings, and save as same-weight vertical sections, which made the page read more like a raw admin form than a focused builder workspace.
- The sticky save bar still hovered near the top on both desktop and mobile, so the commit action competed with the editor before the main question fields.
- The active-reference warning still lived in the top stage instead of alongside the usage section where the operator resolves the constraint.
- The header still used the generic `Current items` stat and the inventory/body copy repeated ordering context already visible in the summary strip.

## Locked decisions

- Keep the scope limited to the Questions workspace with no save-route, field-name, reorder, or guard-behavior changes.
- Preserve advanced-tools reachability, dependency blocking, delete blocking, and the existing question editor contract.
- Rebalance Questions around a paired `usage + identity` lane on desktop instead of full-width same-weight cards.
- Convert the Questions save surface into a final commit row instead of a sticky slab.

## Slice map

1. `59-questions-workspace-structure-and-flow-rebalance`
2. `60-final-questions-workspace-layout-verification`
