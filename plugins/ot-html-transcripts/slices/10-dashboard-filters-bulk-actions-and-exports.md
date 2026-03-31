# Slice 10: Dashboard Filters, Bulk Actions, and Direct Export Downloads

- Phase: `P07`
- Status: `ready-after-09`
- Depends on: `09-dashboard-ops-summary-and-detail`
- Allowed writes: `plugins/ot-html-transcripts/**`, `plugins/ot-dashboard/**` only

## Objective

Extend the transcript workspace from slice `09` with service-backed operator filtering, current-page bulk revoke/delete/export flows, and direct single-transcript export download while keeping `ot-dashboard` a consumer of `ot-html-transcripts:service` rather than a second source of transcript state.

## Deliverables

- service-backed operator list contracts in `ot-html-transcripts` for integrity and retention filtering
- bulk revoke and bulk delete service methods plus bundled bulk export preparation
- dashboard transcript list filters, selection, bulk action bar, and POST routes
- dashboard transcript detail export button and download route
- CSRF/auth, redirect, download, and degraded-capability regression coverage

## Target file plan

- `plugins/ot-html-transcripts/contracts/types.ts`
- `plugins/ot-html-transcripts/contracts/factories.ts`
- `plugins/ot-html-transcripts/service/transcript-service-core.ts`
- `plugins/ot-html-transcripts/service/transcript-service.ts`
- `plugins/ot-html-transcripts/storage/repository.ts`
- `plugins/ot-html-transcripts/README.md`
- `plugins/ot-html-transcripts/test/plugin-contract.test.ts`
- `plugins/ot-html-transcripts/test/storage.test.ts`
- `plugins/ot-html-transcripts/test/service.test.ts`
- `plugins/ot-dashboard/server/transcript-service-bridge.ts`
- `plugins/ot-dashboard/server/transcript-control-center.ts`
- `plugins/ot-dashboard/server/routes/admin.ts`
- `plugins/ot-dashboard/public/views/sections/transcripts.ejs`
- `plugins/ot-dashboard/public/views/sections/transcript-detail.ejs`
- `plugins/ot-dashboard/locales/english.json`
- `plugins/ot-dashboard/test/transcript-workspace.test.ts`
- `plugins/ot-dashboard/test/operational-pages.test.ts`

## Locked policy

- Keep all transcript mutations and export preparation inside `ot-html-transcripts:service`. The dashboard may not read SQLite or transcript archives directly.
- Extend the existing transcript workspace routes. Do not add new top-level transcript pages, standalone download pages, or client-side mutation workflows.
- Add service-backed `integrity` and `retention` filters to the transcript list page. Do not approximate those filters from the current page in the dashboard.
- Keep bulk selection limited to the current rendered page. Do not add “select all matching filters” or any cross-page selection mode in this slice.
- Keep the list page as the bulk-action surface.
- Keep the detail page as the single-transcript export surface only; existing revoke, reissue, and delete forms stay in place.
- Use authenticated, CSRF-protected POST routes for bulk revoke, bulk delete, bulk export, and detail export.
- Preserve current public transcript sharing rules. This slice does not change link privacy, expiry, or slug access.
- Keep repair controls, retention execution controls, and access-policy controls out of this slice.

## Contract additions

1. Add additive `ot-html-transcripts` contracts:
   - `TranscriptOperationalIntegrityFilter = "healthy" | "warning" | "error" | "repairable" | "skipped"`
   - `TranscriptOperationalRetentionFilter = "candidate" | "not-candidate"`
   - `TranscriptOperationalRecord`
   - `TranscriptOperationalListQuery`
   - `TranscriptOperationalListResult`
   - `TranscriptBulkActionItemResult`
   - `TranscriptBulkActionResult`
   - `TranscriptBulkExportItemResult`
   - `TranscriptPreparedBulkExport`
   - `TranscriptPrepareBulkExportResult`
2. Lock `TranscriptOperationalRecord` to the current `TranscriptRecord` fields plus:
   - `integrityHealth`
   - `repairable`
   - `retentionCandidate`
   - `canBulkRevoke`
   - `canBulkDelete`
   - `canExport`
3. Lock `TranscriptOperationalListQuery` to:
   - `search`
   - `status`
   - `integrity`
   - `retention`
   - `limit`
   - `offset`
4. Lock `TranscriptOperationalListResult` to:
   - `total`
   - `items`
5. Lock `TranscriptBulkActionItemResult` to:
   - `transcriptId`
   - `ok`
   - `status`
   - `message`
6. Lock `TranscriptBulkActionResult` to:
   - `action`
   - `requested`
   - `succeeded`
   - `skipped`
   - `failed`
   - `items`
   - `message`
7. Lock `TranscriptBulkExportItemResult` to:
   - `transcriptId`
   - `ok`
   - `status`
   - `message`
   - `fileName`
8. Lock `TranscriptPreparedBulkExport` to:
   - `exportId`
   - `fileName`
   - `filePath`
   - `contentType`
   - `byteSize`
   - `exportedCount`
   - `skippedCount`
   - `createdAt`
9. Lock `TranscriptPrepareBulkExportResult` to:
   - `ok`
   - `message`
   - `export`
   - `items`
10. Extend `OTHtmlTranscriptService` and `TranscriptServiceCore` with additive methods:
    - `listOperationalTranscripts(query: TranscriptOperationalListQuery): Promise<TranscriptOperationalListResult>`
    - `bulkRevokeTranscripts(ids: string[], reason?: string): Promise<TranscriptBulkActionResult>`
    - `bulkDeleteTranscripts(ids: string[], reason?: string): Promise<TranscriptBulkActionResult>`
    - `prepareBulkTranscriptExport(ids: string[]): Promise<TranscriptPrepareBulkExportResult>`
11. Keep `releasePreparedTranscriptExport(exportId)` from slice `08` and extend its release behavior to cover bulk bundle export ids. Do not add a second release API.
12. Mirror the additive contracts into `plugins/ot-dashboard/server/transcript-service-bridge.ts` with `Dashboard`-prefixed equivalents and matching method names.

## Implementation tasks

1. In `plugins/ot-html-transcripts/storage/repository.ts` add a base transcript listing helper for operator filtering that:
   - reuses the current `search` and `status` semantics
   - preserves the current sort order `created_at DESC, id DESC`
   - returns base rows without applying final `limit` and `offset`
   - does not add new SQLite tables or persisted integrity caches
2. In `TranscriptServiceCore.listOperationalTranscripts()`:
   - resolve the base candidate set from the repository
   - compute `retentionCandidate` from current retention config and transcript row state, not from cached dashboard preview data
   - compute `integrityHealth` and `repairable` by reusing the slice `08` integrity evaluator logic
   - compute `canBulkRevoke` from active-link presence
   - compute `canBulkDelete` only for `revoked`, `deleted`, and `failed`
   - compute `canExport` for every transcript except `building`
   - apply `integrity` and `retention` filters after annotation and before pagination
   - treat disabled retention as “all rows are `not-candidate`”
3. Lock list-filter semantics to:
   - `integrity=repairable` means `repairable === true` regardless of `integrityHealth`
   - all other integrity filter values match `integrityHealth` exactly
   - `retention=candidate` means `retentionCandidate === true`
   - `retention=not-candidate` means `retentionCandidate === false`
4. Lock bulk action input rules to:
   - accept transcript ids only, never slugs or ticket ids
   - deduplicate ids while preserving first-seen order
   - reject requests with zero ids
   - reject requests with more than `100` ids
   - apply one shared optional `reason` string to successful revoke/delete operations
5. Lock `bulkRevokeTranscripts()` behavior to:
   - reuse the existing single-target revoke validation and action path for each eligible transcript
   - skip transcripts that have no active link
   - return per-id results without aborting the whole request on a single failure
6. Lock `bulkDeleteTranscripts()` behavior to:
   - reuse the existing single-target delete validation and action path for each eligible transcript
   - skip `active`, `building`, and `partial` transcripts
   - return per-id results without aborting the whole request on a single failure
7. Lock `prepareBulkTranscriptExport()` behavior to:
   - accept transcript ids only
   - skip unresolved ids and `building` transcripts
   - reuse `prepareTranscriptExport()` from slice `08` for each eligible transcript
   - package the successful child zip exports into one bundle zip under `tempRoot/exports/<exportId>/`
   - release each child prepared export after the bundle is finalized
   - return `ok = false` when no selected transcript can be exported
8. Lock bulk bundle layout to:
   - root `manifest.json`
   - `exports/<child-file-name>.zip` for each successful transcript export
9. Lock bundle `manifest.json` to:
   - `formatVersion = 1`
   - `createdAt`
   - `selectedCount`
   - `exportedCount`
   - `skippedCount`
   - `items` containing `transcriptId`, `status`, `fileName`, and `message`
10. In `plugins/ot-dashboard/server/transcript-service-bridge.ts`:
    - keep the current base transcript capability check unchanged
    - keep the slice `09` operations-read capability check unchanged
    - add a new capability check for the slice `10` operator-list, bulk-action, and export methods
11. In `plugins/ot-dashboard/server/transcript-control-center.ts`:
    - extend the current list request model with `integrity` and `retention`
    - extend `buildListHref()` so filter and pagination links preserve those two new query params
    - add helpers for bulk route URLs, validated `returnTo`, row selection metadata, and detail export state
    - keep unsupported `integrity` and `retention` params inert when slice `10` capability is unavailable
12. In the list-page route flow:
    - use `listOperationalTranscripts()` when slice `10` capability is available
    - fall back to the slice `09` read-only list behavior when the capability is unavailable
    - add one checkbox column to the inventory table plus a header checkbox that only selects visible rows
    - add one bulk action bar between the operations overview and the inventory table
13. Lock list-page bulk action bar content to:
    - one hidden `returnTo`
    - one optional shared `reason` field
    - buttons for `Revoke selected`, `Delete selected`, and `Export selected`
    - existing `data-confirm-message` behavior on revoke and delete only
14. Lock bulk route shapes to:
    - `POST /admin/transcripts/bulk/revoke`
    - `POST /admin/transcripts/bulk/delete`
    - `POST /admin/transcripts/bulk/export`
15. Lock `returnTo` handling to:
    - accept only same-dashboard relative paths under the transcript workspace
    - fall back to the canonical transcript list route when invalid
16. Lock bulk route responses to:
    - revoke/delete: redirect back to validated `returnTo` with summary status/message
    - bulk export: stream the bundle as an attachment when `ok = true`, otherwise redirect back to validated `returnTo` with an error
17. In the detail-page route flow:
    - keep current detail rendering from slice `09`
    - add one export button at the top of the existing operations rail
    - disable or hide that button when slice `10` capability is unavailable
18. Lock detail export route shape to:
    - `POST /admin/transcripts/:target/export`
19. Lock detail export behavior to:
    - resolve the transcript through the current detail resolver
    - call existing single-transcript `prepareTranscriptExport()`
    - stream the staged zip as an attachment when preparation succeeds
    - redirect back to the detail page with an error when preparation fails
20. Lock staged export cleanup to:
    - release bundle or single export ids after the response finishes or closes
    - keep release cleanup in the route layer even when streaming fails
21. In the dashboard views:
    - add `integrity` and `retention` selects to the existing list filters form
    - add one selection column to the list table
    - keep single-record destructive forms on the detail page only
    - do not add per-row revoke/delete buttons to the list table
22. Update locale coverage for:
    - filter labels and option text
    - bulk action labels, help text, and confirmations
    - export button text and unavailable messaging
    - bundle/download error messaging

## Service-consumer behavior requirements

- When slice `10` capability is missing, keep the slice `09` read-only transcript workspace usable and do not render bulk controls or detail export controls.
- The dashboard must not reconstruct bulk eligibility or exportability from raw transcript state when the service already reports `canBulkRevoke`, `canBulkDelete`, and `canExport`.
- Bulk actions may produce mixed success and skip results; the dashboard must surface summary outcomes without pretending the request was all-or-nothing.
- The dashboard must not expose prepared export file paths or temp-root internals in the UI.

## Exit criteria

- Slice `10` exposes a service-backed operator list with exact integrity and retention filters.
- The transcript list page supports current-page bulk revoke, bulk delete, and bundled export without adding new pages.
- The transcript detail page supports direct export download without changing existing revoke, reissue, and delete flows.
- Bulk actions and export downloads use the existing authenticated CSRF-protected route model.
- Capability fallback preserves the slice `09` read-only experience when the newer methods are absent.
- Existing transcript sharing rules, public routes, and access policy remain unchanged.

## Verification

- `npm run build`
- `node --test dist/plugins/ot-html-transcripts/test/plugin-contract.test.js`
- `node --test dist/plugins/ot-html-transcripts/test/storage.test.js`
- `node --test dist/plugins/ot-html-transcripts/test/service.test.js`
- `node --test dist/plugins/ot-dashboard/test/transcript-workspace.test.js`
- `node --test dist/plugins/ot-dashboard/test/operational-pages.test.js`

## Required test scenarios

- operator-list filtering honors `search`, `status`, `integrity`, `retention`, `limit`, and `offset`
- disabled retention makes every row `not-candidate`
- `integrity=repairable` returns repairable rows regardless of health
- bulk revoke reuses single-target rules and skips transcripts without an active link
- bulk delete reuses single-target rules and skips `active`, `building`, and `partial` transcripts
- bulk requests reject empty selections and selections larger than `100`
- bulk export creates one bundle zip with `manifest.json` plus one child zip per successful transcript export
- bulk export returns an error result when no selected transcript is exportable
- single-transcript export still works through the detail route and releases staged artifacts after download
- list-page filters and pagination preserve `integrity` and `retention` query params
- list-page bulk revoke/delete preserve `returnTo` state and sanitize invalid `returnTo` values
- list-page bulk export streams a bundle attachment and does not redirect on success
- detail-page export streams an attachment and leaves existing revoke/reissue/delete forms intact
- slice `10` controls disappear cleanly when the newer service methods are missing, while the slice `09` read-only workspace still renders
- operational-pages coverage is updated so the list page now expects bulk controls, but single-record destructive forms remain detail-only

## Promotion gate

- Slices `06`, `07`, `08`, and `09` must be implemented and verified first.
- After slice `09`, stop, compact state into the kernel, and promote this slice in a fresh planning pass before any implementation starts.

## Out of scope

- cross-page selection or “select all filtered” behavior
- repair actions, retention execution controls, or access-policy changes
- new transcript pages, standalone download pages, or public export links
- creator/channel/date-range filters from a later dashboard slice
- changes to transcript privacy, expiry, or public route behavior
