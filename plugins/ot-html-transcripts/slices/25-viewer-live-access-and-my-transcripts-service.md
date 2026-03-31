# Slice 25: Viewer Live Access And My Transcripts Service

- Phase: `P14`
- Status: `blocked-after-24`
- Depends on: `24-admin-discord-auth-live-rbac-and-route-guards`
- Allowed writes: `plugins/ot-dashboard/**`, `plugins/ot-html-transcripts/**` only

## Objective

Move transcript viewer authorization fully into service-owned live access rules and add the service contract required for a viewer-host `My Transcripts` portal.

## Deliverables

- live viewer access context support in transcript service methods
- `listViewerAccessibleTranscripts` or equivalent service-owned portal list contract
- current guild membership enforcement for creator and staff access
- staff access narrowed to stored `admin` participant plus live `Reviewer+`
- additive access-path classification for successful viewer document opens
- bridge/runtime updates so dashboard consumers stay thin service clients

## Target file plan

- `plugins/ot-html-transcripts/service/transcript-service.ts`
- `plugins/ot-html-transcripts/service/transcript-service-core.ts`
- `plugins/ot-html-transcripts/storage/` repository files only if a new portal list query is truly required
- `plugins/ot-dashboard/server/transcript-service-bridge.ts`
- `plugins/ot-dashboard/server/dashboard-runtime-api.ts`
- `plugins/ot-dashboard/server/routes/viewer.ts`
- `plugins/ot-html-transcripts/test/service.test.ts`
- `plugins/ot-html-transcripts/test/http.test.ts`
- `plugins/ot-html-transcripts/test/end-to-end.test.ts`
- `plugins/ot-dashboard/test/viewer-routes.test.ts`

## Locked policy

- Service-owned viewer authorization is authoritative. Dashboard route handlers may not duplicate or bypass the access rules.
- Creator access requires:
  - signed-in Discord user id equals stored transcript creator id
  - current guild membership at request time
- Staff access requires:
  - current guild membership at request time
  - live `Reviewer`, `Editor`, or `Admin` tier
  - stored transcript participant role `admin`
- Stored participant role `participant` never grants viewer access by itself.
- Admin/owner direct viewer access is allowed as `owner-override`, but it does not create a second global list surface.
- The portal list must return only currently accessible, non-gone transcript summaries.
- If live member resolution is unavailable and the last known member state is older than `60s`, viewer access fails closed.
- Canonical transcript links must be built from `buildViewerPublicUrl`, not the legacy admin-host URL helper.

## Implementation tasks

1. Extend service types to accept live viewer access context or equivalent additive authorization inputs.
2. Replace the current stored-metadata-only viewer role resolution with a live authorization decision that composes:
   - stored transcript role
   - current guild membership
   - live staff tier
3. Add a service-owned list method for the future `My Transcripts` page.
4. Update canonical private-view URL generation to use the viewer-host runtime helper.
5. Keep direct transcript and asset rendering guarded by the service, not by dashboard-only logic.
6. Extend dashboard service bridge typing for the new list method and live access result shape.
7. Add tests for creator, recorded-admin staff, participant denial, stale live lookup denial, and owner override.

## Exit criteria

- Stored transcript metadata is no longer sufficient for staff viewer access by itself.
- Creator and staff viewer access both require current guild membership.
- The service can supply a read-only list of transcripts the signed-in viewer may currently access.
- Direct transcript and asset routes remain protected by the same service-owned live rule set.

## Verification

- `npm run build`
- `node --test dist/plugins/ot-html-transcripts/test/service.test.js dist/plugins/ot-html-transcripts/test/http.test.js dist/plugins/ot-html-transcripts/test/end-to-end.test.js`
- `node --test dist/plugins/ot-dashboard/test/viewer-routes.test.js`

## Required test scenarios

- creator in current guild can open their transcript
- creator outside current guild is denied
- recorded `admin` participant with live `Reviewer+` access can open the transcript
- recorded `participant` is denied even if currently staff
- stale live member state with failed refresh denies access
- owner/admin direct access succeeds without exposing a global list
- canonical private viewer URL generation uses the viewer-host URL helper

## Promotion gate

- Slice `24` must be implemented and verified first.
- After slice `25`, update kernel state and then promote slice `26`.

## Out of scope

- full `My Transcripts` page rendering
- admin security workspace UI
- durable auth audit tables
