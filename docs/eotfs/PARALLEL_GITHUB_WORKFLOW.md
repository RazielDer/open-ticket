# EoTFS Parallel GitHub Lane Workflow

## Purpose
This workflow lets the Hetzner server and the home PC prepare independent EoTFS Open Ticket source changes through GitHub without making the wrapper controller kernel multi-active.

Parallel lane mode is disabled by default. It is available only when the active wrapper controller objective or active slice records a lane manifest. Until then, the normal two-machine rule remains one task branch per unit of work.

The wrapper `workflow.yaml` remains the controller authority. GitHub issues, draft PRs, labels, branch names, and comments are coordination surfaces only.

## Activation Contract
The controller may activate lane fanout only by recording a lane manifest in the active objective or slice. A lane manifest must identify:

- objective ID and active slice
- lane ID
- owner and machine
- base branch
- lane branch
- allowed paths
- forbidden paths
- hot files or hotspot clusters
- required checks
- evidence paths
- linked issue and draft PR
- current lane status

If a worker lane needs to touch a path outside its manifest, that lane stops until the controller updates the manifest. Worker lanes do not self-expand scope.

## Branch And PR Model
When lane fanout is active:

- `integrate/<objective-key>` is the controller-owned integration branch.
- `lane/<objective-key>/<lane-key>` is a worker branch targeting the integration branch.
- The controller lane owns merges from worker lane PRs into the integration branch.
- The final PR to `main` is opened or updated only after the integration branch has combined verification evidence.

Draft PRs are the live handoff surface. A lane PR is not ready for integration until it lists the manifest, commands run, evidence path, residual risks, and any forbidden-scope or hot-file concerns.

## Ownership Rules
Only the controller lane may edit wrapper workflow authority files unless the lane manifest assigns them:

- wrapper `workflow.yaml`
- wrapper `workflow.md`
- wrapper `workflow-ledger.yaml`
- wrapper `runtime/controller-state.yaml`
- wrapper `active/active-slice.md`
- final wrapper handoff mirrors

Worker lanes may edit Open Ticket source, tests, docs, and lane-local evidence only inside their declared allowed paths.

Hot files are single-owner for the whole active objective. Core action handlers, dashboard routes, config/database defaults, migration code, permission loading, transcript builders, and workflow files require controller ownership unless the lane manifest assigns them to exactly one lane.

Home and server are machine locations, not authority levels. Production promotion, scheduled task changes, live Discord sends, production env edits, production DSNs, runtime clone edits, and `_runtime` changes remain server-only and require explicit authorization.

## GitHub Surfaces
Use one GitHub issue per lane. The issue records the lane manifest, blockers, ownership, and readiness evidence.

Use one draft PR per lane branch. The PR records:

- linked lane issue
- objective ID and active slice
- lane ID
- allowed and forbidden paths
- hot-file declaration
- workflow-file touch declaration
- checks run
- evidence path
- production-boundary attestation
- residual risks

Standard labels:

- `lane:controller`
- `lane:worker`
- `machine:home`
- `machine:server`
- `status:blocked`
- `status:ready-for-integration`
- `risk:hot-file`
- `risk:prod-boundary`
- `needs:portable-postgres`
- `needs:server-only`
- `needs:controller-review`

## Evidence And Verification
Lane evidence belongs in the wrapper `evidence/` directory unless a slice names a narrower path. Evidence files must redact secrets, tokens, webhook URLs, DSNs, production paths, and other sensitive values.

Lane PR floor:

- `npm run build`
- narrow tests declared in the lane issue or PR
- wrapper governance checks when wrapper workflow or evidence changes

Integration branch floor:

- `npm run build`
- every lane-declared narrow test bundle
- the active slice's final verification floor before controller closeout

Release and production promotion remain separate gates.

## Failure Handling
If a lane is blocked, mark the issue and PR with `status:blocked` and record the exact blocker. Do not continue by widening the lane locally.

If GitHub metadata disagrees with repo state, treat repo state as authoritative and update the issue or PR.

If a command would restart scheduled tasks, send Discord messages, mutate production env files, promote runtime changes, edit `_runtime`, or use production secrets, stop unless the current controller objective explicitly authorizes that live operation.
