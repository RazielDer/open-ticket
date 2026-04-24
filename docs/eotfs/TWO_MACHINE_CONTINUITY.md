# EoTFS Two-Machine Development Continuity

## Purpose
This document keeps EoTFS Open Ticket source work portable between the Hetzner Windows server and the Windows 11 home PC. It does not make both machines production operators. GitHub branches, draft PRs, repo-owned workflow files, and source-only verification are the continuity layer.

## Machine Roles
- Server dev root: `C:\Users\Administrator\Desktop\PoT\Bot\EoTFS Ticket Bot\open-ticket`
- Server compatibility path: `C:\Users\Administrator\Desktop\PoT\Bot\EoTFS Open Ticket`
- Home dev root: `B:\Users\Raziel\Desktop\PoT\Bot\EoTFS Ticket Bot\open-ticket`
- Home compatibility path: `B:\Users\Raziel\Desktop\PoT\Bot\EoTFS Open Ticket`
- GitHub remote: `https://github.com/RazielDer/open-ticket.git`
- Upstream remote: `https://github.com/open-discord-bots/open-ticket.git`
- Server-only surface: production promotion, scheduled task changes, live Discord sends, production runtime clones, production env files, production DSNs, and production secrets.
- Home-PC surface: source development, EoTFS-local docs, offline verification, branch pushes, draft PR updates, and review.

`C:\Users\Administrator\Desktop\PoT\Bot\EoTFS Open Ticket` is a junction to the same checkout as `C:\Users\Administrator\Desktop\PoT\Bot\EoTFS Ticket Bot\open-ticket`. Apply changes once.

## Authority
For the whole EoTFS ticket-platform program, the workspace wrapper kernel is authoritative:

1. `C:\Users\Administrator\Desktop\PoT\Bot\EoTFS Ticket Bot\workflow.yaml`
2. The active slice named by that workflow.
3. `C:\Users\Administrator\Desktop\PoT\Bot\EoTFS Ticket Bot\active\active-slice.md`
4. Wrapper `workflow.md` and evidence files.
5. Local plugin kernels only when the active wrapper objective points at them.

GitHub issues, draft PRs, labels, and branch names coordinate work only. They do not override the wrapper controller kernel or the Open Ticket source tree.

## Branch And PR Model
Use GitHub as the source-history and handoff layer.

- Work on one task branch per unit of work.
- Preserve active dirty implementation work in a pushed WIP branch before creating docs/template branches.
- Keep EoTFS-local docs/template rollout separate from implementation WIP.
- Parallel lane fanout is disabled unless the active controller objective or active slice records a lane manifest. When active, use `integrate/<objective-key>` for the controller integration branch and `lane/<objective-key>/<lane-key>` for worker branches targeting that integration branch. See [Parallel GitHub Lane Workflow](PARALLEL_GITHUB_WORKFLOW.md).
- Do not replace upstream Open Ticket issue templates with EoTFS-local templates. Add EoTFS templates alongside upstream templates.
- Do not use stashes as the normal handoff mechanism.

## Session Rituals
At the start of a session:

```powershell
git fetch --all --prune
git status -sb
git remote -v
```

Then read the wrapper authority files and the active slice before continuing implementation.

Before leaving either machine:

1. Run `git status -sb`.
2. Run the narrow checks for the touched area.
3. Commit intentional source, workflow, evidence, and doc changes.
4. Push the active branch.
5. Update the draft PR or handoff comment with what changed, what passed, and what remains blocked.

If the prior machine has unpushed dirty work, the switch is blocked until that work is pushed, intentionally abandoned, or transferred as a patch.

## Home-PC Bootstrap Checks
From `B:\Users\Raziel\Desktop\PoT\Bot\EoTFS Ticket Bot\open-ticket`, verify:

```powershell
git --version
gh --version
gh auth status
node --version
npm --version
git remote -v
git status -sb
```

Then run the normal source floor for docs or EoTFS-local branch work:

```powershell
npm run build
```

For active implementation slices, run the exact Node test bundle named by the wrapper active slice before marking the WIP safe.

## Production Boundary
The home PC does not need production secrets to be useful for development. Production operations stay on the server unless a later explicit controller objective authorizes a different model.

Home agents must not:

- promote source into production runtime clones
- restart scheduled tasks
- send Discord messages
- mutate production env files, DSNs, or secrets
- hand-edit files in server runtime clones

Server agents must still commit and push workflow truth before asking the home PC to continue work. Production access is not a substitute for repo-owned evidence.

## Readiness Criteria
The two-machine workflow is ready when:

- a fresh home clone discovers the EoTFS wrapper authority from committed docs
- both machines can build the source tree
- unfinished source work can move through pushed branches instead of local dirty state
- EoTFS-local templates coexist with upstream Open Ticket templates
- server-only production boundaries remain explicit and enforced
