# Panels Workspace Layout Refinement Planning

## Objective

Refine `/visual/panels` so it stops reading like a long utility form, keeps the matte login-aligned look, and uses the editor lane more deliberately.

## Repo-grounded findings

- The Panels workspace still stacked identity, picker, preview, and embed as same-weight full-width cards, which made the page read like a long form instead of a builder workspace.
- The sticky save bar still hovered near the top on both desktop and mobile, so the commit action competed with the editor before the user reached the main builder sections.
- The dropdown compatibility warning lived in the top stage instead of beside the structured option picker where the conflict is resolved.
- The header still used the generic `Current items` stat and the inventory/body copy repeated order guidance already visible in the summary cards.

## Locked decisions

- Keep the scope limited to the Panels workspace plus the narrow client-side color-input compatibility fix required for the existing panel editor to load invalid saved colors without browser warnings.
- Preserve the existing save route, submitted payload shape, reorder behavior, picker behavior, preview behavior, warning reachability, and advanced-tool reachability.
- Rebalance Panels around paired desktop lanes for `identity + embed` and `picker + preview` instead of four same-weight full-width slabs.
- Convert the Panels save surface into a final commit row instead of a sticky slab.

## Slice map

1. `57-panels-workspace-structure-and-flow-rebalance`
2. `58-final-panels-workspace-layout-verification`
