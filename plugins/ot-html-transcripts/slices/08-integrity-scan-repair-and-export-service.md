# Slice 08: Integrity Scan, Repair, and Export Service

- Phase: `P06`
- Status: `ready-after-07`
- Depends on: `07-retention-execution-and-sweep-actions`
- Allowed writes: `plugins/ot-html-transcripts/**` only

## Objective

Add transcript archive integrity summary and detail scans, safe bounded repair actions, and service-owned ZIP export capability after the operations and retention layer is in place.

## Deliverables

- integrity summary and per-transcript detail scan contracts
- bounded repair actions for common archive and DB drift cases
- service-owned ZIP export staging and release methods
- startup cleanup coverage for staged export artifacts
- targeted storage, service, and end-to-end tests

## Target file plan

- `contracts/types.ts`
- `storage/repository.ts`
- `storage/recovery.ts`
- `service/transcript-service-core.ts`
- `service/transcript-service.ts`
- `plugin.json`
- `README.md`
- `test/plugin-contract.test.ts`
- `test/storage.test.ts`
- `test/service.test.ts`
- `test/end-to-end.test.ts`

## Locked policy

- Do not add dashboard UI, command arguments, or HTTP routes in this slice.
- Do not add new plugin config in this slice.
- Keep all archive access service-owned. `ot-dashboard` may later consume service methods, but it must not read transcript archives directly.
- Scan all transcript rows in summary mode.
- Treat `building` transcripts as `skipped`, not corrupt.
- Treat `failed`, `revoked`, and `deleted` transcripts with `archivePath = null` after retention as healthy metadata-only states, not integrity failures.
- Keep repair behavior bounded to:
  - `clear-archive-metadata`
  - `rerender-index-html`
  - `downgrade-missing-assets`
  - `demote-to-failed`
- Do not reconstruct missing asset rows, rebuild full archives, or regenerate `document.json` in this slice.
- Use the vendored `yazl` ZIP writer in `plugins/ot-html-transcripts/vendor/yazl.js`; keep external npm dependencies limited to packages that must actually be installed.
- Stage prepared export artifacts under `tempRoot/exports/<exportId>/` so explicit release and startup recovery can clean them up.

## Contract additions

1. Add additive integrity and export types in `contracts/types.ts`:
   - `TranscriptIntegrityHealth = "healthy" | "warning" | "error" | "skipped"`
   - `TranscriptIntegrityIssueSeverity = "warning" | "error"`
   - `TranscriptIntegrityIssueCode = "build-in-progress" | "unsafe-archive-path" | "archive-directory-missing" | "document-missing" | "document-invalid" | "document-transcript-mismatch" | "html-missing" | "asset-file-missing" | "asset-row-missing" | "orphan-asset-row"`
   - `TranscriptIntegrityRepairAction = "clear-archive-metadata" | "rerender-index-html" | "downgrade-missing-assets" | "demote-to-failed"`
   - `TranscriptIntegrityIssue`
   - `TranscriptIntegritySummary`
   - `TranscriptIntegrityReport`
   - `TranscriptIntegrityRepairFailure`
   - `TranscriptIntegrityRepairResult`
   - `TranscriptExportFormat = "zip"`
   - `TranscriptPreparedExport`
   - `TranscriptPrepareExportResult`
2. Lock `TranscriptIntegrityIssue` fields to:
   - `code`
   - `severity`
   - `message`
   - `repairableActions`
3. Lock `TranscriptIntegritySummary` to:
   - `scannedAt`
   - `total`
   - `healthy`
   - `warning`
   - `error`
   - `repairable`
   - `skipped`
   - `issueCounts`
4. Lock `TranscriptIntegrityReport` to:
   - `transcript`
   - `scannedAt`
   - `health`
   - `issues`
   - `repairableActions`
   - `archivePathSafe`
   - `archivePresent`
   - `documentPresent`
   - `htmlPresent`
5. Lock `TranscriptIntegrityRepairResult` to:
   - `ok`
   - `target`
   - `transcriptId`
   - `requestedActions`
   - `appliedActions`
   - `failures`
   - `reportBefore`
   - `reportAfter`
   - `message`
6. Lock `TranscriptPreparedExport` to:
   - `exportId`
   - `transcriptId`
   - `format`
   - `fileName`
   - `filePath`
   - `contentType`
   - `byteSize`
   - `archiveIncluded`
   - `createdAt`
7. Lock `TranscriptPrepareExportResult` to:
   - `ok`
   - `target`
   - `transcriptId`
   - `message`
   - `export`

## Implementation tasks

1. Extend the event taxonomy from slice `06` with:
   - `integrity-repaired`
   - `export-prepared`
2. Add repository scan support for integrity summary:
   - list every transcript row needed for full-scan evaluation
   - do not rely on dashboard or direct SQLite consumers for any integrity data
3. Add additive service methods:
   - `getIntegritySummary(): Promise<TranscriptIntegritySummary>`
   - `scanTranscriptIntegrity(target: string): Promise<TranscriptIntegrityReport | null>`
   - `repairTranscriptIntegrity(target: string, actions?: TranscriptIntegrityRepairAction[]): Promise<TranscriptIntegrityRepairResult>`
   - `prepareTranscriptExport(target: string, format?: "zip"): Promise<TranscriptPrepareExportResult>`
   - `releasePreparedTranscriptExport(exportId: string): Promise<boolean>`
4. Keep current transcript list/detail, build, revoke, reissue, delete, and public serving methods intact.
5. Resolve integrity scan, repair, and export targets with the existing admin target rules:
   - transcript id
   - any slug, not only the active slug
   - ticket id
   - channel id
6. Lock summary scan behavior to:
   - scan all transcript rows
   - count `building` as `skipped`
   - count transcripts with no issues as `healthy`
   - count transcripts whose highest-severity issue is warning-only as `warning`
   - count transcripts with any error issue as `error`
   - count transcripts with any non-empty `repairableActions` as `repairable`
7. Lock detail scan behavior to:
   - emit `build-in-progress` and `health = "skipped"` for `building` targets
   - emit no issue for retention-cleared `failed`, `revoked`, or `deleted` transcripts that have `archivePath = null`
   - emit `unsafe-archive-path` as an error when the stored archive path escapes the configured archive root
   - emit `archive-directory-missing` as an error when `archivePath` is set but the archive directory is absent
   - emit `document-missing` as an error when the archive lacks `document.json`
   - emit `document-invalid` as an error when `document.json` cannot be parsed into the current transcript document structure
   - emit `document-transcript-mismatch` as an error when parsed `document.transcriptId` does not match the transcript row id
   - emit `html-missing` as an error when `index.html` is missing
   - emit `asset-file-missing` as a warning when a mirrored asset row or mirrored document ref points at a missing file
   - emit `asset-row-missing` as a warning when a mirrored document ref has an asset name that has no matching asset row
   - emit `orphan-asset-row` as a warning when a mirrored asset row exists but the document no longer references it
8. Lock repair action application rules to:
   - `clear-archive-metadata`: clear `archivePath`, zero `totalBytes`, and refresh `updatedAt`; only valid for `failed`, `revoked`, or `deleted` transcripts with missing or unsafe archives
   - `rerender-index-html`: parse valid `document.json`, render HTML with the existing renderer, and overwrite `index.html`
   - `downgrade-missing-assets`: parse valid `document.json`, rewrite affected mirrored asset refs to failed/unavailable, rewrite matching asset rows from mirrored to failed with `localPath = ""` and `byteSize = 0`, then rerender `index.html`
   - `demote-to-failed`: for `active` or `partial` transcripts that still cannot serve a usable archive after any earlier repairable actions; revoke any active link, set transcript status to `failed`, clear `archivePath`, zero `totalBytes`, and write a repair reason
9. If `repairTranscriptIntegrity()` is called with no explicit actions, apply all currently repairable actions in this exact order:
   - `clear-archive-metadata`
   - `rerender-index-html`
   - `downgrade-missing-assets`
   - `demote-to-failed`
10. Always rescan after repair and return both `reportBefore` and `reportAfter`.
11. Log one `integrity-repaired` event per successful repair call with details:
    - `actions`
    - `healthBefore`
    - `healthAfter`
    - `resultingStatus`
    - `activeLinkRevoked`
12. Do not log read-only integrity scans.
13. Lock export preparation to:
    - reject unresolved targets cleanly with `ok = false`
    - reject `building` transcripts
    - prepare exactly one ZIP artifact per call
    - always include `manifest.json`
    - include `archive/` contents only when the archive path passes safety validation and the directory exists
    - fall back to metadata-only ZIP export when archive bytes are missing or unsafe
14. Lock `manifest.json` contents to:
    - `formatVersion = 1`
    - `exportedAt`
    - `archiveIncluded`
    - `transcript`
    - `links`
    - `participants`
    - `assets`
    - `events`
    - `integrityReport`
15. Lock prepared export lifecycle to:
    - stage files under `tempRoot/exports/<exportId>/`
    - return the staged path through `TranscriptPreparedExport`
    - remove the staged directory when `releasePreparedTranscriptExport(exportId)` is called
    - return `false` from release for unknown export ids
    - let startup recovery remove leftover staged exports because they live under the temp root
16. Log one `export-prepared` event per successful export preparation with details:
    - `format`
    - `archiveIncluded`
    - `exportId`

## Service behavior requirements

- No direct SQLite or archive reads by future dashboard code; all integrity, repair, and export access must go through the service.
- Export staging must never expose raw transcript archive paths as the public dashboard contract.
- Integrity summary and detail must reflect retention behavior from slice `07`; metadata-only revoked/deleted/failed transcripts are normal if the archive was swept.
- Repair actions must be manual only; there is no startup auto-repair in this slice.
- Existing public transcript URLs and admin command flows must remain unchanged.

## Exit criteria

- Integrity summary and per-transcript detail reports are fully typed and callable through the service.
- Repair actions are bounded, deterministic, and produce stable pre/post results.
- Broken `active` or `partial` transcripts can be demoted to `failed` when they cannot be safely repaired.
- Prepared exports produce a service-owned ZIP with manifest data and metadata-only fallback when archive bytes are missing.
- Startup recovery removes leftover export staging directories under the temp root.
- Existing transcript build, serve, revoke, reissue, delete, and retention behavior remains intact.

## Verification

- `npm run build`
- `node --test dist/plugins/ot-html-transcripts/test/plugin-contract.test.js`
- `node --test dist/plugins/ot-html-transcripts/test/storage.test.js`
- `node --test dist/plugins/ot-html-transcripts/test/service.test.js`
- `node --test dist/plugins/ot-html-transcripts/test/end-to-end.test.js`

## Required test scenarios

- plugin manifest keeps external npm dependencies limited to install-time packages, the vendored ZIP writer remains present, and README/service docs stay aligned
- integrity summary counts `healthy`, `warning`, `error`, `repairable`, and `skipped` correctly
- detail scans classify `building`, missing archive directories, unsafe archive paths, missing `document.json`, invalid `document.json`, missing `index.html`, missing asset files, missing asset rows, and orphan asset rows correctly
- valid `document.json` with missing `index.html` repairs through HTML rerender
- missing mirrored asset files downgrade document refs and asset rows, then rerender HTML
- unrepaired broken `active` and `partial` transcripts demote to `failed`, clear archive metadata, and revoke active links
- `failed`, `revoked`, and `deleted` transcripts with broken archive paths repair through metadata clearing only
- successful repair logs `integrity-repaired` and returns post-repair scan data
- ZIP export includes archive files when present and falls back to metadata-only when archive bytes are missing
- prepared export release removes staged artifacts and returns `false` for unknown ids
- startup recovery removes leftover staged export directories under `tempRoot/exports`

## Promotion gate

- Slices `06` and `07` must be implemented and verified first.
- After slice `07`, stop, compact state into the kernel, and promote this slice in a fresh planning pass before any implementation starts.

## Out of scope

- dashboard UI, routes, or service-bridge changes
- command-surface changes
- public export download routes
- missing asset-row reconstruction
- full archive rebuild from source messages
- regeneration of `document.json`
- access-control or link-expiry changes
