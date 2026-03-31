# Slice 07: Retention Execution and Sweep Actions

- Phase: `P06`
- Status: `ready-on-promotion`
- Depends on: `06-ops-contracts-and-storage`
- Allowed writes: `plugins/ot-html-transcripts/**` only

## Objective

Add opt-in transcript retention policy, preview, and archive-sweep execution on top of the event and repository contracts from slice `06` without changing current transcript generation, public route shape, or dashboard behavior.

## Deliverables

- retention config contract, defaults, and checker coverage
- repository retention-candidate query and archive-clear mutation
- service preview and execute methods for retention sweeps
- startup retention auto-run wired after stale-building recovery
- per-transcript `archive-swept` event capture for successful sweeps
- targeted contract, storage, and service tests for preview and execution behavior

## Target file plan

- `contracts/types.ts`
- `config/defaults.ts`
- `config/register-checker.ts`
- `storage/repository.ts`
- `service/transcript-service-core.ts`
- `service/transcript-service.ts`
- `test/plugin-contract.test.ts`
- `test/storage.test.ts`
- `test/service.test.ts`

## Locked policy

- Only `failed`, `revoked`, and `deleted` transcripts are eligible in this slice.
- `active`, `partial`, and `building` transcripts are never retention targets in this slice.
- Retention age uses the existing `transcripts.updated_at` field.
- Cleanup is archive-only:
  - remove on-disk archive bytes
  - keep transcript rows, link rows, participant rows, asset rows, and event history
  - set `archivePath = null`
  - set `totalBytes = 0`
- Asset rows remain for audit and transcript detail history even when their stored archive-relative paths no longer exist on disk.
- Startup auto-run is enabled only when `retention.enabled` is true.
- Startup execution must run after stale `building` recovery and before the service reports healthy.
- The sweep is best-effort per transcript; one failed deletion must not abort the rest of the run.

## Config contract

1. Extend `OTHtmlTranscriptsConfigData` with:
   - `retention.enabled: boolean`
   - `retention.runOnStartup: boolean`
   - `retention.maxTranscriptsPerRun: number`
   - `retention.statuses.failedDays: number`
   - `retention.statuses.revokedDays: number`
   - `retention.statuses.deletedDays: number`
2. Lock defaults to:
   - `enabled = false`
   - `runOnStartup = true`
   - `maxTranscriptsPerRun = 100`
   - `failedDays = 30`
   - `revokedDays = 365`
   - `deletedDays = 7`
3. Lock checker rules to:
   - all retention day values must be integers `>= 0`
   - `maxTranscriptsPerRun` must be an integer `>= 1`
   - `enabled` and `runOnStartup` must be booleans

## Contract additions

1. Add additive retention types in `contracts/types.ts`:
   - `TranscriptRetentionCandidate`
   - `TranscriptRetentionPreview`
   - `TranscriptRetentionExecutionResult`
2. Lock `TranscriptRetentionCandidate` fields to:
   - `transcriptId`
   - `status`
   - `updatedAt`
   - `ageDays`
   - `configuredDays`
   - `archivePath`
   - `totalBytes`
3. Lock `TranscriptRetentionPreview` to:
   - `enabled`
   - `runOnStartup`
   - `maxTranscriptsPerRun`
   - `windows`
   - `totalCandidates`
   - `candidates`
4. Lock `TranscriptRetentionExecutionResult` to:
   - `enabled`
   - `trigger`
   - `attempted`
   - `swept`
   - `failed`
   - `freedBytes`
   - `candidates`
   - `failures`
5. Lock execution triggers to:
   - `"startup"`
   - `"manual"`

## Implementation tasks

1. Extend the event taxonomy from slice `06` with `archive-swept`.
2. Add repository query support for retention candidates:
   - only rows with `status IN ('failed', 'revoked', 'deleted')`
   - only rows with `archive_path IS NOT NULL`
   - compare `updated_at` against the per-status cutoff timestamp
   - sort by `updated_at ASC, id ASC`
   - apply `maxTranscriptsPerRun`
3. Add a repository mutation for successful sweeps that:
   - sets `archive_path = NULL`
   - sets `total_bytes = 0`
   - sets `updated_at = now`
   - leaves `status`, `status_reason`, links, participants, assets, and search text untouched
4. Add additive service methods:
   - `previewRetentionSweep(): Promise<TranscriptRetentionPreview>`
   - `executeRetentionSweep(trigger?: "manual" | "startup"): Promise<TranscriptRetentionExecutionResult>`
5. Keep all existing service methods intact.
6. Lock `previewRetentionSweep()` behavior to:
   - return current config values and candidate list
   - perform no file deletion or row mutation
   - return zero candidates when retention is disabled
7. Lock `executeRetentionSweep()` behavior to:
   - return a structured no-op result when retention is disabled
   - resolve the same candidate set as preview using current config
   - process each candidate independently
   - continue after individual candidate failures
8. For each candidate execution:
   - validate the archive path with existing archive-root safety helpers
   - if the path exists, remove it recursively
   - if the path does not exist, treat that as a normalizable sweep success
   - clear archive metadata in the transcript row only after safety validation passes
9. Lock failure handling to:
   - leave the transcript row unchanged when safety validation fails
   - leave the transcript row unchanged when file deletion throws
   - record the failure in the execution result
10. Emit one `archive-swept` event for each successful transcript sweep with:
    - `reason = null`
    - details including `priorStatus`, `priorArchivePath`, `configuredDays`, `trigger`, and `freedBytes`
11. Do not emit retention events for preview calls.
12. Update core initialization order to:
    - initialize storage and repository
    - recover stale `building` transcripts
    - execute startup retention sweep when `retention.enabled && retention.runOnStartup`
    - mark the service healthy
13. Preserve current public transcript and admin-action behavior outside the new retention methods.
14. Keep this slice inside `plugins/ot-html-transcripts/**` only. Do not change `ot-dashboard` in this slice.

## Service behavior requirements

- Swept transcripts remain queryable in list and detail views as historical metadata.
- Swept revoked transcripts are no longer reissuable because `archivePath` is null and the current reissue guard must continue to protect that path.
- Storage summary must reflect current on-disk usage after a sweep because `totalBytes` is zeroed on successful archive removal.
- Existing transcript detail behavior may continue to show asset metadata whose backing files no longer exist after a sweep.
- This slice must not add dashboard UI, command arguments, or HTTP routes.

## Exit criteria

- Retention config is fully typed, defaulted, and checker-validated.
- Preview and execute service methods return stable typed results.
- Startup auto-run executes only when enabled and runs after stale-build recovery.
- Successful sweeps clear `archivePath`, zero `totalBytes`, and append `archive-swept` events.
- Failed sweeps do not corrupt transcript metadata and do not stop later candidates from running.
- Existing compile, serve, revoke, reissue, delete, and transcript-detail behavior remains intact.

## Verification

- `npm run build`
- `node --test dist/plugins/ot-html-transcripts/test/plugin-contract.test.js`
- `node --test dist/plugins/ot-html-transcripts/test/storage.test.js`
- `node --test dist/plugins/ot-html-transcripts/test/service.test.js`

## Required test scenarios

- config defaults include the retention block and checker-compatible values
- candidate query filters by status, `updatedAt`, non-null `archivePath`, and run cap
- candidate query ordering is `updated_at ASC, id ASC`
- preview returns disabled/no-op data when retention is off
- preview returns the expected candidate set and window values when retention is on
- execute returns a no-op result when retention is disabled
- execute removes an existing archive directory, clears `archivePath`, and zeroes `totalBytes`
- execute normalizes an already-missing archive path into a successful sweep
- execute leaves transcript metadata unchanged when path validation fails
- execute continues to later candidates when one deletion fails
- successful execution emits `archive-swept` events with the locked detail payload
- startup auto-run happens after stale `building` recovery and before healthy summary state is reported
- swept revoked transcripts fail existing reissue checks because no archive remains

## Promotion gate

- Slice `06` must be implemented and verified first.
- After slice `06`, stop, compact state into the kernel, and promote this slice in a fresh planning pass before any implementation starts.

## Out of scope

- retention of `active`, `partial`, or `building` transcripts
- dashboard surfaces, filters, or bulk actions
- integrity scan, repair, or export behavior
- link-expiry or private-access policy changes
