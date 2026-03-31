# Slice 06: Operations Contracts and Storage

- Phase: `P06`
- Status: `ready`
- Depends on: `05-admin-tests-cutover`
- Allowed writes: `plugins/ot-html-transcripts/**` only

## Objective

Add the durable operations and audit foundation for v2 so later retention, integrity, export, and dashboard slices can build on stable service and repository contracts without changing current transcript build or serve behavior.

## Deliverables

- transcript event log schema and repository methods
- additive service method for transcript event history
- automatic event capture for existing build, recovery, and admin mutation flows
- targeted storage and service tests covering the new contracts

## Target file plan

- `contracts/types.ts`
- `storage/repository.ts`
- `storage/recovery.ts`
- `service/transcript-service-core.ts`
- `service/transcript-service.ts`
- `test/storage.test.ts`
- `test/service.test.ts`

## Implementation tasks

1. Add additive operations types in `contracts/types.ts`:
   - `TranscriptEventType = build-started | build-succeeded | build-partial | build-failed | link-revoked | link-reissued | transcript-deleted | recovery-marked-failed`
   - `TranscriptEventDetails = Record<string, string | number | boolean | null>`
   - `TranscriptEventRecord`
   - `CreateTranscriptEventInput`
   - `ListTranscriptEventsQuery`
   - `ListTranscriptEventsResult`
2. Lock `ListTranscriptEventsQuery` to:
   - `limit?: number`
   - `offset?: number`
   - `types?: TranscriptEventType[]`
3. Lock list-event query normalization to:
   - default `limit = 25`
   - clamp `limit` to `1..100`
   - default `offset = 0`
   - clamp negative `offset` to `0`
   - treat missing or empty `types` as no type filter
4. Add a new SQLite table named `transcript_events` with:
   - `id TEXT PRIMARY KEY`
   - `transcript_id TEXT NOT NULL`
   - `type TEXT NOT NULL`
   - `reason TEXT`
   - `details_json TEXT`
   - `created_at TEXT NOT NULL`
   - foreign key `transcript_id REFERENCES transcripts(id) ON DELETE CASCADE`
5. Add indexes for:
   - `transcript_id, created_at`
   - `type`
   - `created_at`
6. Make schema setup migration-safe:
   - do not recreate or destructively rewrite existing transcript tables
   - create `transcript_events` if absent
   - leave existing transcript rows and archive paths untouched
7. Add repository methods:
   - `createTranscriptEvent(input)`
   - `listTranscriptEvents(transcriptId, query)`
8. Lock `TranscriptEventRecord` mapping rules:
   - order results by `created_at DESC, id DESC`
   - parse `details_json` into `details`
   - if `details_json` is null or blank, return `{}`
   - if `details_json` cannot be parsed, return `{}`
9. Add an additive service method:
   - `listTranscriptEvents(target: string, query: ListTranscriptEventsQuery): Promise<ListTranscriptEventsResult>`
10. Keep all current service methods intact and keep `getTranscriptDetail()` unchanged in this slice.
11. Resolve `listTranscriptEvents()` targets with admin resolution rules:
   - transcript id
   - any slug, not only the active slug
   - ticket id
   - channel id
12. If `listTranscriptEvents()` cannot resolve the target, return `{ total: 0, items: [] }` and do not throw.
13. Capture the following events in `TranscriptServiceCore` at these exact points:
   - `build-started`: immediately after the transcript row and active link are created
   - `build-succeeded`: after finalizing a build with transcript status `active`
   - `build-partial`: after finalizing a build with transcript status `partial`
   - `build-failed`: after build failure handling completes
   - `link-revoked`: after revoke status and link updates complete
   - `link-reissued`: after the new active slug is created and transcript status is restored
   - `transcript-deleted`: after archive deletion, link invalidation, and transcript status update complete
14. Lock event detail payloads to:
   - `build-started`: `ticketId`, `channelId`, `guildId`
   - `build-succeeded`: `messageCount`, `attachmentCount`, `warningCount`, `totalBytes`
   - `build-partial`: `messageCount`, `attachmentCount`, `warningCount`, `totalBytes`
   - `link-reissued`: `newSlug`
   - all other event types: no required details payload
15. Lock event reason rules to:
   - `build-failed`: store the failure text in `reason`
   - `link-revoked`, `link-reissued`, `transcript-deleted`: store the admin reason when provided
   - `recovery-marked-failed`: store the exact reason `Recovered stale building transcript after startup.`
16. Extend recovery to emit per-transcript recovery events:
   - collect stale `building` transcript ids before marking them failed
   - append one `recovery-marked-failed` event per recovered transcript
   - keep summary count behavior unchanged
17. Do not create event rows for orphan temp-directory cleanup in this slice.

## Service behavior requirements

- This slice must not change compile result shape, transcript URLs, public HTTP routes, or current admin command behavior.
- Existing transcript build and mutation flows must continue to work when event logging is present.
- Event logging failures are fatal for the active operation only if the same operation already depends on the database write succeeding.
- No dashboard, config, checker, or command-surface changes are allowed in this slice.

## Exit criteria

- `transcript_events` exists in clean and migrated plugin databases.
- Current build and mutation flows automatically append the locked event rows.
- Recovery appends `recovery-marked-failed` rows for recovered stale builds.
- `listTranscriptEvents()` returns stable, sorted results by transcript id, slug, ticket id, or channel id.
- Existing transcript detail and public transcript behavior remains unchanged.

## Verification

- `npm run build`
- `node --test dist/plugins/ot-html-transcripts/test/storage.test.js`
- `node --test dist/plugins/ot-html-transcripts/test/service.test.js`

## Required test scenarios

- clean database init creates `transcript_events`
- migrated database init leaves prior transcript rows intact and adds `transcript_events`
- repository event listing sorts newest first and filters by `types`
- successful build logs `build-started` then `build-succeeded`
- partial build logs `build-started` then `build-partial`
- fatal build logs `build-started` then `build-failed`
- revoke, reissue, and delete append the correct event type and reason
- startup recovery appends `recovery-marked-failed` for stale `building` transcripts
- unresolved `listTranscriptEvents()` target returns an empty result instead of throwing

## Out of scope

- retention policy config or cleanup execution
- integrity scan or repair
- export or download behavior
- dashboard surfaces
