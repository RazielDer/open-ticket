# General Workspace Layout Refinement Planning

## Objective

Refine `/visual/general` so it uses the shared editor lane more deliberately, feels less clustered, and stays aligned with the matte `/login` reference without introducing glow or new workflow features.

## Repo-grounded findings

- The General workspace still rendered `Connection`, `Status`, `Logs`, `Limits`, and `Advanced` as one same-weight vertical stack even though the desktop editor lane is wide enough to support calmer grouping.
- The General sidebar navigation still spent too much vertical space on stacked one-column links before the form on mobile.
- The General advanced section still stacked five collapsed disclosures in one column, which made the lower half of the page read like repeated card chrome instead of structured advanced groups.
- The General save surface still behaved like a floating slab instead of a deliberate end-of-form commit row, which competed with the connection card on desktop.
- The shared shell was already matte and glow-free, so this pass should stay structural and General-specific rather than reopening the broader editor system.

## Locked decisions

- Keep the change scoped to `General` plus the minimal shared CSS, locale, test, and workflow updates needed to support it.
- Rebalance the General form around better width usage: keep connection first, let status act as the primary secondary block, pair logs and limits, and lay out advanced disclosures more efficiently.
- Keep the advanced-tools tray behavior unchanged, but reduce the surrounding clutter through denser General navigation and a calmer save surface.
- Preserve the existing General save route, submitted field names, raw JSON reachability, and advanced disclosure content.

## Slice map

1. `53-general-workspace-structure-and-density-rebalance`
2. `54-final-general-workspace-layout-verification`
