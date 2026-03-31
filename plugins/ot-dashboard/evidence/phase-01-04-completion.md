# OT Dashboard Transcript Integration Completion Evidence

Date: `2026-03-25`

## Implemented scope

- Expanded `ot-html-transcripts:service` for dashboard detail consumption:
  - `publicUrl` and `statusReason` on transcript records
  - `TranscriptLinkRecord`, `TranscriptParticipantRecord`, `TranscriptAssetRecord`, and `TranscriptDetail`
  - `getTranscriptDetail(target)` service method
  - in-place SQLite migrations for `transcripts.status_reason` and `assets.reason`
- Added dashboard-owned transcript integration under `plugins/ot-dashboard`:
  - runtime/service bridge with soft-optional states
  - `/admin/transcripts` list page
  - `/admin/transcripts/:target` detail page
  - `revoke`, `reissue`, and `delete` POST routes with canonical transcript-id resolution
  - overview degraded-state warning when transcript mode is `html` and the service is unavailable
  - top-level `Transcripts` admin nav entry
  - `/visual/transcripts` link into the transcript workspace
  - `Plugins > ot-html-transcripts` transcript workspace summary card and shortcut
- Added dashboard verification coverage:
  - transcript service bridge state tests
  - transcript workspace route, filter, mutation, and plugin-workbench tests

## Verification commands

1. `npm --prefix plugins/ot-dashboard run build:editor`
   - Result: passed
2. `npm run typecheck`
   - Result: failed because the repo does not define a `typecheck` script
   - Exact failure: `npm error Missing script: "typecheck"`
3. `npm run build`
   - Result: passed
4. `node --test dist/plugins/ot-dashboard/test`
   - Result: passed
   - Count: `37` passed, `0` failed
5. `node --test dist/plugins/ot-html-transcripts/test`
   - Result: passed
   - Count: `24` passed, `0` failed

## Behavior proof covered by tests

- Dashboard transcript bridge resolves `ready`, `runtime-unavailable`, `missing-plugin`, `missing-service`, and `unhealthy` states.
- Overview and transcript routes degrade cleanly when the transcript runtime is unavailable.
- Transcript list routes pass normalized search, status, and pagination query data into the transcript service.
- Transcript detail routes render transcript metadata, link history, participants, and assets through the transcript service only.
- Transcript mutation routes resolve non-canonical targets first, then call the service with the canonical transcript id.
- The transcript config editor links into the operational transcript workspace.
- The `ot-html-transcripts` plugin detail page shows transcript workspace shortcuts and summary data.

## Scope proof

- No source files were modified outside `plugins/ot-dashboard/**` and `plugins/ot-html-transcripts/**`.
- The dashboard never reads the transcript SQLite file directly.
