# Planning Basis v2

## Shipped baseline

The v1 local transcript replacement and the broader enhancement roadmap are already complete through slice `17`. Historical implementation and proof live in:

- `slices/01-scaffold-contracts.md`
- `slices/02-service-storage-recovery.md`
- `slices/03-collection-dto-assets.md`
- `slices/04-render-http-compiler.md`
- `slices/05-admin-tests-cutover.md`
- `evidence/phase-01-02-foundation.md`
- `evidence/phase-03-05-completion.md`

That shipped baseline already covers:

- local html transcript compilation with full history
- SQLite transcript indexing
- plugin-owned HTTP serving
- revoke, reissue, delete, retention, integrity, and export operations
- service-class consumption by the dashboard transcript workspace
- optional dashboard-hosted private transcript viewer mode
- transcript preview and styling workflow
- advanced operator filtering and transcript-workspace URL-state

## Why a post-completion stabilization phase is still justified

The plugin is functionally complete for its current single-host mission. That does not mean every useful hardening step is done.

Two narrow gaps remain worth closing before the plugin should be treated as “stabilize-only”:

1. Public transcript deployment posture is easy to misconfigure.
2. Successful private viewer document opens are not yet reflected in transcript event history.

Everything else that might be tempting is deliberately deferred:

- no analytics or reporting pages
- no persisted saved views
- no compliance/redaction workflow
- no object storage or multi-node deployment work
- no new dashboard navigation or second transcript analysis surface

## Locked operating model for the stabilization extension

- Keep the controller kernel under `plugins/ot-html-transcripts` as the only planning system.
- Keep writes inside `plugins/ot-html-transcripts/**` and `plugins/ot-dashboard/**` only.
- Keep `config/transcripts.json` as the transcript source of truth.
- Keep `ot-dashboard` a consumer of `ot-html-transcripts:service`, never a direct SQLite reader.
- Keep the html compiler result shape `{ url: string, availableUntil: Date }`.
- Keep current transcript success and failure UX contracts intact.
- Keep the deployment model single-host and additive; do not invent shared-storage or distributed-locking behavior.

## Active slice scope decision

Slice `18-deployment-warnings-and-workbench-notices` is the active stabilization slice.

It is intentionally limited to:

- additive deployment warning evaluation for transcript hosting posture
- non-fatal warning logs during transcript-plugin startup
- plugin-owned dashboard workbench notices for the same warning state
- README and contract-test updates that lock the warning behavior

It explicitly does not allow:

- checker failures for unsafe deployment posture
- transcript route changes
- public/private mode behavior changes
- new service methods
- ot-dashboard registry changes

### Locked policy for slice 18

- Warning conditions are exactly:
  - `server.host` is not loopback.
  - `links.access.mode == "public"` and `server.publicBaseUrl` resolves to loopback or localhost.
  - `links.access.mode == "public"` and external `server.publicBaseUrl` uses `http:` instead of `https:`.
- `private-discord` mode must not warn about an empty `server.publicBaseUrl`.
- Warnings are additive and non-fatal.
- Startup must continue; no warning condition becomes a checker error.
- Workbench notices must be rendered by the transcript plugin’s own workbench provider, appended after the current workbench section.
- No route shape, compile contract, or public/private transcript lifecycle behavior changes belong in this slice.

### Locked warning copy for slice 18

- `server-bind-public`
  - `Transcript HTTP server is not loopback-only. Bind it to 127.0.0.1 and publish it through Cloudflare or another trusted reverse proxy.`
- `public-url-loopback`
  - `Public transcript links point to a loopback URL. Replace server.publicBaseUrl with the external transcript URL before sharing links.`
- `public-url-http`
  - `Public transcript links use http. Put the transcript origin behind HTTPS at the edge before exposing it.`

## Queued next slice decisions

Slice `19-private-viewer-access-audit-events` is fully locked as the prepared next slice.

It is intentionally limited to:

- one new transcript event type for successful private viewer document opens
- additive event recording in the transcript service after successful private document render
- dashboard event-label rendering for the new type
- README and targeted tests that lock the behavior

It explicitly does not allow:

- asset access logging
- unauthorized access logging
- public-mode access logging
- viewer auth rule changes
- route or HTTP status changes
- transcript analytics or reporting surfaces

### Locked policy for slice 19

- Add exactly one new event type: `viewer-accessed`.
- Record it only when `links.access.mode == "private-discord"` and `renderViewerTranscript(...)` returns `status: "ok"` for the document route.
- Do not record it for:
  - asset fetches
  - unauthorized or missing transcript requests
  - expired, revoked, or deleted `410` responses
  - public-mode accesses
- Record one event per successful document render; no dedupe or throttling belongs in this slice.
- Event `reason` remains `null`.
- Event `details` must include exactly:
  - `viewerUserId`
  - `viewerRole`
  - `slug`
  - `linkId`
- `viewerRole` is locked to `creator | participant | admin`.
- The hook point is after successful private document render, not during authorization preflight.
- Dashboard event history stays in the current UI and gets only a friendly label for the new type.

## Repo-grounded implications for slice 18

- `ot-html-transcripts/index.ts` already initializes the service during bootstrap and logs readiness, so deployment warnings can be emitted there without changing startup ownership.
- `ot-html-transcripts/config/register-checker.ts` already validates structural config, so slice `18` can stay additive by warning instead of rejecting startup.
- `ot-html-transcripts/dashboard-workbench.ts` already owns the transcript plugin workbench output, so warning notices can appear on the plugin detail page without new `ot-dashboard` registry contracts.
- The shipped `config.json` is local/dev oriented, so the README must explicitly explain that public transcript mode needs a real external HTTPS URL or private-discord mode.

## Repo-grounded implications for slice 19

- `TranscriptEventType` already covers build, lifecycle, retention, integrity, and export events, so `viewer-accessed` can be added without reshaping the broader event model.
- The private viewer path already resolves stored creator/participant access before document render, so successful document opens are the correct additive audit hook.
- Viewer asset serving is already separate from document rendering, so asset fetches can remain event-free without new route machinery.
- The dashboard transcript detail page already renders event labels with locale-backed copy and raw fallback behavior, so slice `19` only needs an additive event label mapping.

## Execution note

The user has explicitly approved sequential execution across slices `18` then `19`.

- Slice `18` must still pass its locked verification commands before slice `19` starts.
- The kernel must be updated after slice `18` completes so slice `19` becomes the active slice.
- The sequential override does not authorize any work beyond slice `19`.
