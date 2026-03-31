# Slice 02: Service, Storage, and Recovery

- Phase: `P02`
- Status: `ready`
- Depends on: `01-scaffold-contracts`
- Allowed writes: `plugins/ot-html-transcripts/**` only

## Objective

Build the plugin's durable control plane: service class, SQLite schema, repository layer, queue state, archive path handling, and startup recovery.

## Deliverables

- `ot-html-transcripts:service`
- SQLite initialization and schema creation
- repository/query layer
- queue manager with depth reporting
- recovery logic for stale builds and temp directories

## Target file plan

- `contracts/types.ts`
- `service/transcript-service.ts`
- `storage/sqlite.ts`
- `storage/repository.ts`
- `storage/archive-paths.ts`
- `storage/recovery.ts`
- `queue/transcript-queue.ts`
- `test/storage.test.ts`
- `test/service.test.ts`

## Implementation tasks

1. Define durable types:
   - `TranscriptStatus = building | active | partial | revoked | deleted | failed`
   - `TranscriptLinkStatus = active | revoked | superseded | deleted`
   - `TranscriptAssetStatus = mirrored | failed | skipped`
   - `TranscriptRecord`
   - `TranscriptLinkRecord`
   - `TranscriptAssetRecord`
   - `ActionResult`
2. Initialize SQLite using `sqlite3` with:
   - `PRAGMA journal_mode=WAL`
   - `PRAGMA synchronous=NORMAL`
   - `PRAGMA busy_timeout=5000`
   - `PRAGMA foreign_keys=ON`
3. Create schema for:
   - `transcripts`
   - `transcript_links`
   - `participants`
   - `assets`
4. Add indexes:
   - active slug uniqueness
   - `ticket_id`
   - `channel_id`
   - `guild_id`
   - `status`
   - `created_at`
5. Implement repository operations the service needs:
   - create `building` transcript row
   - insert active slug
   - finalize transcript as `active` or `partial`
   - mark transcript `failed`, `revoked`, or `deleted`
   - supersede and reissue slugs
   - resolve by transcript id, slug, ticket id, or channel id
   - list with `search`, `status`, `limit`, and `offset`
   - compute summary counters and archive byte totals
6. Implement archive path helpers:
   - final path `runtime/ot-html-transcripts/transcripts/<transcriptId>/`
   - temp path sibling or child path that is never public
   - normalized path validation to prevent accidental escape from the archive root
7. Implement a queue manager:
   - respect `queue.maxActiveTranscripts`
   - expose `queueDepth`
   - prevent overlapping archive builds for the same transcript target
8. Implement the service class and register it via `onPluginClassLoad`:
   - `isHealthy()`
   - `getSummary()`
   - `resolveTranscript(target)`
   - `listTranscripts(query)`
   - `revokeTranscript(id, reason?)`
   - `reissueTranscript(id, reason?)`
   - `deleteTranscript(id, reason?)`
9. Recovery on startup:
   - find stale `building` rows and mark them `failed`
   - remove orphan temp directories
   - store recovered count for `getSummary()` and later `/health`
10. Log revoke, reissue, and delete reasons to DB and console.

## Service behavior requirements

- `resolveTranscript()` accepts transcript id, active slug, ticket id, or channel id.
- Reissue must create a new active slug and supersede the old one.
- Delete must invalidate links, remove archive files, and mark the transcript deleted.
- The service remains the only supported future integration path for `ot-dashboard`.

## Exit criteria

- Service methods behave against real or test SQLite state.
- Recovery marks stale `building` rows as failed and cleans orphan temp paths.
- Queue depth and recovered build count are surfaced by the service summary.
- No file or DB code escapes the configured archive root or sqlite path.

## Verification

- `npm run build`
- `node --test dist/plugins/ot-html-transcripts/test/storage.test.js`
- `node --test dist/plugins/ot-html-transcripts/test/service.test.js`

## Out of scope

- Discord message collection
- asset fetching
- HTML generation
- HTTP routes
