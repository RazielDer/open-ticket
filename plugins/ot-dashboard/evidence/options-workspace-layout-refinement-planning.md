# Options Workspace Layout Refinement Planning

## Objective

Refine `/visual/options` so it stops reading like a clustered wall of same-weight sections, keeps the dark matte login-aligned look, and uses the editor lane more deliberately.

## Repo-grounded findings

- The Options workspace still used a tall same-weight top stack: toolbar, summary cards, warning slab, and sticky save bar all competed before the main option fields.
- The selected `ticket` option still left the `Website` and `Role` sections visible because shared `.section-card` styling overrode the `hidden` attribute, which made the page look jumbled and much longer than intended.
- The ticket editor still read as one long vertical form even though channel setup, automation, question assignment, and transcript routing are distinct operator tasks.
- The inventory and summary copy still said more than needed, which inflated the sidebar and summary cards without improving scan speed.

## Locked decisions

- Keep the scope limited to the Options workspace plus the narrow shared `[hidden]` fix required for the intended section toggling to actually work.
- Preserve the existing save route, submitted payloads, reorder behavior, warnings, and advanced-tool reachability.
- Rebalance the ticket editor around clearer subsections instead of one long full-width wall.
- Convert the Options save surface into a final commit row instead of a sticky slab.

## Slice map

1. `55-options-workspace-structure-and-visibility-fix`
2. `56-final-options-workspace-layout-verification`
