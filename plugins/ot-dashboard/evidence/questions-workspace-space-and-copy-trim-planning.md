# Questions Workspace Space And Copy Trim Planning

## Objective

Refine `/visual/questions` so it removes the remaining redundant copy and wasted space while staying matte, glow-free, and behaviorally unchanged.

## Repo-grounded findings

- The Questions workspace still spent height on helper copy in the inventory, top stage, usage section, advanced disclosure, and save row even after the structural rebalance.
- The summary strip still used detail lines that repeated state already visible through the labels and values.
- The usage and identity sections still read more like narrated form steps than a focused operator workspace.
- On `390x844`, the stage, detail lane, and save row were still taller than they needed to be because the page was explaining visible controls instead of relying on hierarchy.

## Locked decisions

- Keep the scope limited to the Questions workspace with no save-route, field-name, reorder, or guard-behavior changes.
- Preserve advanced-tools reachability, dependency blocking, delete blocking, and the existing question editor contract.
- Trim helper text from the inventory, stage, usage, identity, advanced, and save surfaces where the heading and visible controls already carry the meaning.
- Collapse the Questions summary strip to label/value cards and shorten visible labels where that improves scan speed without changing behavior.

## Slice map

1. `67-questions-workspace-space-and-copy-trim`
2. `68-final-questions-workspace-space-and-copy-trim-verification`
