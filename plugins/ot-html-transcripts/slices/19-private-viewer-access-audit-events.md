# Slice 19: Private Viewer Access Audit Events

- Phase: `P12`
- Status: `ready-after-18`
- Depends on: `18-deployment-warnings-and-workbench-notices`
- Allowed writes: `plugins/ot-html-transcripts/**`, `plugins/ot-dashboard/**`

## Objective

Record successful private viewer document opens as transcript event history and render a friendly dashboard label for the new event type without changing viewer authorization, asset behavior, or public-mode semantics.

## Deliverables

- one additive transcript event type for successful private viewer document opens
- service-layer event recording after successful private viewer document render
- dashboard event-label support for the new event type
- README and targeted tests that lock the audit behavior

## Target file plan

- `plugins/ot-html-transcripts/contracts/types.ts`
- `plugins/ot-html-transcripts/service/transcript-service-core.ts`
- `plugins/ot-html-transcripts/README.md`
- `plugins/ot-html-transcripts/test/service.test.ts`
- `plugins/ot-dashboard/server/transcript-control-center.ts`
- `plugins/ot-dashboard/locales/english.json`
- `plugins/ot-dashboard/test/transcript-workspace.test.ts`

## Locked policy

- Add exactly one new event type: `viewer-accessed`.
- Record it only when:
  - `links.access.mode == "private-discord"`
  - `renderViewerTranscript(...)` returns `status: "ok"` for the document route
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
- Lock `viewerRole` to:
  - `creator`
  - `participant`
  - `admin`
- Extend the successful private-view context with the active link and resolved viewer role rather than inventing a second authorization query.
- The event hook belongs after successful document render, not during authorization preflight.
- Dashboard event history must keep the existing UI and raw fallback behavior for unrelated unknown event types.
- Keep viewer auth, transcript availability semantics, and public-mode behavior unchanged.

## Implementation tasks

1. Extend `TranscriptEventType` in `contracts/types.ts` with `viewer-accessed`.
2. In `transcript-service-core.ts`, extend the successful private-view resolution context so it carries the active link and resolved viewer role needed for the audit event.
3. Keep unauthorized, missing, and gone responses unchanged.
4. In `renderViewerTranscript(...)`, after successful HTML render and before returning `status: "ok"`, append the `viewer-accessed` event with the locked detail fields.
5. Keep asset-serving code paths free of the new audit event.
6. Update `README.md` so transcript event history explicitly documents successful private viewer document opens.
7. In `ot-dashboard/server/transcript-control-center.ts`, add the new event type to the event-label mapping.
8. In `ot-dashboard/locales/english.json`, add the friendly label copy for the new event type.
9. Extend `service.test.ts` and `transcript-workspace.test.ts` to prove the new event appears only in the locked success path.

## Exit criteria

- Successful private viewer document renders create `viewer-accessed` events with the locked details.
- Asset fetches, unauthorized requests, gone responses, and public-mode requests do not create the event.
- Dashboard transcript detail shows a friendly label for the new event type.
- Existing viewer auth, `404`/`410` behavior, and public-mode semantics remain unchanged.

## Verification

- `npm run build`
- `node --test dist/plugins/ot-html-transcripts/test/plugin-contract.test.js`
- `node --test dist/plugins/ot-html-transcripts/test/service.test.js`
- `node --test dist/plugins/ot-dashboard/test/transcript-workspace.test.js`

## Required test scenarios

- an authorized private viewer document render logs one `viewer-accessed` event
- the event details include `viewerUserId`, `viewerRole`, `slug`, and `linkId`
- repeated asset requests do not log `viewer-accessed`
- unauthorized viewer requests do not log `viewer-accessed`
- gone responses do not log `viewer-accessed`
- public mode does not log `viewer-accessed`
- dashboard transcript detail renders the friendly label for `viewer-accessed`
- unrelated unknown event types still fall back to the raw event name

## Promotion gate

- Slice `18` must be implemented, verified, and reflected into the kernel first.
- After slice `19` passes verification, update the kernel state to mark phase `P12` completed and clear the active and prepared slice pointers.

## Out of scope

- logging asset requests
- logging unauthorized viewer attempts
- viewer-auth rule changes
- new viewer routes or status-code changes
- analytics pages, reporting, or saved-view features
