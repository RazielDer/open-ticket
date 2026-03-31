# `ot-html-transcripts` Enhancement Workflow v2

## Goal

Extend and stabilize the shipped local transcript and dashboard plugins in controlled phases without touching Open Ticket core outside `plugins/ot-html-transcripts/**` and `plugins/ot-dashboard/**`.

## Current baseline

The enhancement roadmap is implemented and verified through slice `22`. The current plugin set already provides:

- full-history local HTML transcript generation
- SQLite-backed transcript indexing and lifecycle operations
- plugin-owned HTTP transcript hosting and optional private-discord viewer mode
- dashboard transcript workspace consumption through the service class
- transcript preview, styling presets, and localized editor copy
- advanced operator filtering and durable URL-state inside the dashboard transcript workspace
- deployment warnings and additive `viewer-accessed` transcript audit events
- plugin-owned ticket-option transcript routing controls and compiler-wrapper delivery

## Reopened phase

Phase `P14` reopens the workflow for one stricter access-control wave:

- Cloudflare-ready dual-host routing for admin and viewer surfaces
- Discord-based admin auth with live guild-role revalidation
- a viewer-host `My Transcripts` portal for creators and assigned staff
- durable SQLite-backed auth/session/OAuth/rate-limit state in `ot-dashboard`
- Admin-only RBAC/security management inside the existing dashboard shell

This phase stays entirely inside the two plugin folders and explicitly does not add browser-side ticket creation or general end-user ticket actions.

## Locked product decisions

- Deployment target is split-host:
  - `publicBaseUrl` is the admin host canonical URL.
  - `viewerPublicBaseUrl` is the viewer host canonical URL.
  - The app must remain secure without trusting Cloudflare Access headers as its only authorization source.
- Access model is locked to three staff tiers:
  - `Reviewer`: viewer-host only, read-only transcript portal access for transcripts they currently qualify to see.
  - `Editor`: reviewer capabilities plus the visual `Options`, `Panels`, and `Questions` editors only.
  - `Admin`: full admin host, global transcript workspace, transcript operations, plugin/runtime/evidence, and RBAC/security management.
- The viewer-host `My Transcripts` portal is the only browser discovery surface for creators and non-admin staff.
- Global transcript inventory remains Admin-only.
- Current main-guild membership is required for all viewer-host access.
- Staff transcript access requires both:
  - live `Reviewer+` staff eligibility at request time
  - stored transcript participant role `admin`
- Stored transcript participant role `participant` never grants web viewer access by itself.
- Auth/session/rate-limit/OAuth state moves to a durable SQLite store at `runtime/ot-dashboard/auth.sqlite`.
- Admin and viewer cookies remain separate and host-only.
- Live authorization revalidation happens on every authorized request using the running bot with cache freshness capped at `60s`; stale unresolved state fails closed.
- The security workspace may edit non-secret RBAC and host-routing fields only. OAuth client secret, session secret, and breakglass password hash remain env/config managed and read-only in the UI.
- UI additions must stay inside the existing matte dark dashboard language: no glow, no roomy marketing layouts, no redundant copy, and no drift from the current `login.ejs`, `transcript-viewer-login.ejs`, `admin-shell.ejs`, and editor cards.

## Fixed boundaries

- Only write inside `plugins/ot-html-transcripts/**` and `plugins/ot-dashboard/**`.
- Do not edit `src/**`, `config/**`, `database/**`, or any other main-repo path outside the two plugin directories.
- Preserve `config/transcripts.json` as the upstream source of truth for transcript mode and the global/default transcript channel.
- Preserve the html compiler return shape `{ url: string, availableUntil: Date }`.
- Preserve delete-ticket, transcript-ready, transcript-error, retry, continue, and visit-button flows unless a slice explicitly scopes an additive auth/access change.
- Preserve text transcript contents, file output, and ready-message copy.
- Do not let `ot-dashboard` or any other consumer read transcript SQLite state directly.
- Escalate if any slice requires distributed storage, multi-node coordination, or a base-repo edit outside the two plugin folders.

## Working cadence

1. Keep `workflow.yaml` and this document as the master roadmap.
2. Keep one active slice implementation-ready at a time.
3. Promote the prepared next slice only after the active slice is implemented, verified, and the kernel is updated.
4. The user has explicitly approved sequential execution across slices `23` through `28`, but the implementer must still update kernel state between slices.
5. Implement only the active slice until its locked verification passes.

## Roadmap

### P06 Operations Hardening Foundation

- `06-ops-contracts-and-storage`
- `07-retention-execution-and-sweep-actions`
- `08-integrity-scan-repair-and-export-service`

### P07 Dashboard Operations Consumer

- `09-dashboard-ops-summary-and-detail`
- `10-dashboard-filters-bulk-actions-and-exports`

### P08 Access And Privacy Controls

- `11-link-policy-and-expiry`
- `12-dashboard-private-access-mode`

### P09 Transcript UX And Styling Tooling

- `13-transcript-preview-and-style-presets`
- `14-transcript-editor-copy-and-localization`

### P10 Integration Cleanup

- `15-dashboard-self-registration-and-workbench-refactor`

### P11 Operator Search And Query Refinement

- `16-operator-query-contracts-and-filtered-summary`
- `17-dashboard-advanced-transcript-filters-and-url-state`

### P12 Deployment Guardrails And Private-View Auditability

- `18-deployment-warnings-and-workbench-notices`
- `19-private-viewer-access-audit-events`

### P13 Plugin-Owned Per-Option Transcript Routing

- `20-plugin-owned-option-routing-contracts`
- `21-compiler-wrapper-delivery-routing`
- `22-dashboard-option-editor-routing-controls`

### P14 Discord Auth, Viewer Portal, And Access Hardening

- `23-dashboard-auth-store-and-dual-host-foundation`
- `24-admin-discord-auth-live-rbac-and-route-guards`
- `25-viewer-live-access-and-my-transcripts-service`
- `26-my-transcripts-portal-and-security-workspace`
- `27-audit-logging-and-security-hardening`
- `28-final-auth-access-polish-and-verification`

## Active slice

`23-dashboard-auth-store-and-dual-host-foundation`

## Prepared next slice

`24-admin-discord-auth-live-rbac-and-route-guards`

## Prepared following slice

`25-viewer-live-access-and-my-transcripts-service`

## Resume order

1. `workflow.yaml`
2. `slices/23-dashboard-auth-store-and-dual-host-foundation.md`
3. `active/active-slice.md`
4. `workflow.md`
5. `evidence/phase-14-stricter-access-and-portal-basis.md`
6. `runtime/controller-state.yaml`

## Program verification posture

- `npm run build`
- `npm --prefix plugins/ot-dashboard run build:editor`
- `node --test dist/plugins/ot-dashboard/test/app.test.js dist/plugins/ot-dashboard/test/auth.test.js dist/plugins/ot-dashboard/test/viewer-routes.test.js dist/plugins/ot-dashboard/test/transcript-workspace.test.js dist/plugins/ot-dashboard/test/operational-pages.test.js dist/plugins/ot-dashboard/test/editor-layout.test.js dist/plugins/ot-dashboard/test/roundtrip.test.js`
- `node --test dist/plugins/ot-html-transcripts/test/plugin-contract.test.js dist/plugins/ot-html-transcripts/test/service.test.js dist/plugins/ot-html-transcripts/test/http.test.js dist/plugins/ot-html-transcripts/test/end-to-end.test.js`

Per-slice verification is locked in each slice document and must pass before kernel promotion.
