# Slice 09: Dashboard Operations Summary and Detail

- Phase: `P07`
- Status: `ready-after-08`
- Depends on: `08-integrity-scan-repair-and-export-service`
- Allowed writes: `plugins/ot-dashboard/**` only

## Objective

Consume the operations read surface from slices `06` through `08` inside the existing transcript workspace, adding global integrity and retention visibility on the list page and per-transcript integrity and event history on the detail page without changing service ownership, auth, or destructive transcript flows.

## Deliverables

- read-only dashboard bridge types and capability detection for event history, retention preview, and integrity reads
- transcript list page integrity and retention summary cards plus an operations overview section
- transcript detail integrity section and paged event history
- graceful degradation when the base transcript service is present but the new operations read methods are missing or throw
- locale, route, view-model, and test coverage for the new read-only surfaces

## Target file plan

- `plugins/ot-dashboard/server/transcript-service-bridge.ts`
- `plugins/ot-dashboard/server/transcript-control-center.ts`
- `plugins/ot-dashboard/server/routes/admin.ts`
- `plugins/ot-dashboard/public/views/sections/transcripts.ejs`
- `plugins/ot-dashboard/public/views/sections/transcript-detail.ejs`
- `plugins/ot-dashboard/locales/english.json`
- `plugins/ot-dashboard/test/transcript-workspace.test.ts`
- `plugins/ot-dashboard/test/operational-pages.test.ts`

## Locked policy

- Do not modify `ot-html-transcripts` runtime or service code in this slice. If slices `06` through `08` do not expose a sufficient read surface, stop and return to planning instead of compensating inside the dashboard.
- Keep `ot-dashboard` a service consumer only. No direct SQLite reads, archive reads, or archive-path-based logic is allowed.
- Extend the existing `GET /admin/transcripts` and `GET /admin/transcripts/:target` routes only.
- Add no new transcript POST routes, destructive flows, repair actions, retention actions, or export actions in this slice.
- Keep the existing revoke, reissue, and delete forms on the detail page and preserve their current redirect behavior.
- Put global integrity and retention visibility on the transcript list page.
- Put per-transcript integrity and event history on the transcript detail page.
- Do not infer transcript-specific retention eligibility beyond what the global retention preview already returns.
- Parse `eventsPage` as a positive integer with fallback `1`. Use a fixed event page size of `25` and render previous/next controls only.
- When operations reads are unavailable, keep the list and detail pages functional and render warning blocks for the new sections instead of hiding the workspace.
- Keep the plugin workbench behavior and transcript workspace navigation unchanged in this slice.

## Contract additions

1. Extend `server/transcript-service-bridge.ts` with additive read-only operations types:
   - `DashboardTranscriptEventRecord`
   - `DashboardListTranscriptEventsQuery`
   - `DashboardListTranscriptEventsResult`
   - `DashboardTranscriptRetentionCandidate`
   - `DashboardTranscriptRetentionPreview`
   - `DashboardTranscriptIntegrityHealth`
   - `DashboardTranscriptIntegrityIssueSeverity`
   - `DashboardTranscriptIntegrityIssueCode`
   - `DashboardTranscriptIntegrityIssue`
   - `DashboardTranscriptIntegritySummary`
   - `DashboardTranscriptIntegrityReport`
2. Lock `DashboardTranscriptEventRecord` fields to:
   - `id`
   - `transcriptId`
   - `type`
   - `reason`
   - `details`
   - `createdAt`
3. Lock `DashboardListTranscriptEventsQuery` to:
   - `limit`
   - `offset`
4. Lock `DashboardListTranscriptEventsResult` to:
   - `total`
   - `items`
5. Lock `DashboardTranscriptRetentionCandidate` fields to:
   - `transcriptId`
   - `status`
   - `updatedAt`
   - `ageDays`
   - `configuredDays`
   - `archivePath`
   - `totalBytes`
6. Lock `DashboardTranscriptRetentionPreview` to:
   - `enabled`
   - `runOnStartup`
   - `maxTranscriptsPerRun`
   - `windows`
   - `totalCandidates`
   - `candidates`
7. Lock `DashboardTranscriptIntegrityIssue` fields to:
   - `code`
   - `severity`
   - `message`
   - `repairableActions`
8. Lock `DashboardTranscriptIntegritySummary` to:
   - `scannedAt`
   - `total`
   - `healthy`
   - `warning`
   - `error`
   - `repairable`
   - `skipped`
   - `issueCounts`
9. Lock `DashboardTranscriptIntegrityReport` to:
   - `transcript`
   - `scannedAt`
   - `health`
   - `issues`
   - `repairableActions`
   - `archivePathSafe`
   - `archivePresent`
   - `documentPresent`
   - `htmlPresent`
10. Extend `DashboardTranscriptService` with additive read-only methods only:
    - `listTranscriptEvents(target: string, query: DashboardListTranscriptEventsQuery): Promise<DashboardListTranscriptEventsResult>`
    - `previewRetentionSweep(): Promise<DashboardTranscriptRetentionPreview>`
    - `getIntegritySummary(): Promise<DashboardTranscriptIntegritySummary>`
    - `scanTranscriptIntegrity(target: string): Promise<DashboardTranscriptIntegrityReport | null>`
11. Keep `DashboardTranscriptIntegrationState` unchanged in this slice. Add a separate operations-read capability check instead of introducing new integration states.

## Implementation tasks

1. In `server/transcript-service-bridge.ts`:
   - keep `isTranscriptService()` validating the existing base transcript service methods only
   - add a separate helper that checks whether the four new operations-read methods are present
   - do not let missing operations-read methods change a base integration state from `ready` to `missing-service`
2. In `server/transcript-control-center.ts` add helpers for:
   - operations-read availability state and warning copy
   - integrity health label and badge tone mapping
   - retention window summary text
   - retention candidate row formatting
   - `eventsPage` parsing with fixed page size `25`
   - event type labels with raw-type fallback
   - event details formatting into a single server-rendered line
3. Lock event details formatting to:
   - pass strings through unchanged
   - serialize objects and arrays with `JSON.stringify`
   - treat `null`, `undefined`, and empty strings as a localized empty value
   - truncate display text to `200` characters with an ellipsis
   - avoid client-side expanders or JSON viewers in this slice
4. In the list-page route flow:
   - keep calling `getSummary()` and `listTranscripts()` exactly as today
   - when base integration is `ready` and operations reads are supported, also call `previewRetentionSweep()` and `getIntegritySummary()`
   - if either operations-read call throws, keep the page render successful and mark operations reads unavailable for the new sections only
5. Lock list-page summary-card behavior to:
   - preserve the existing four summary cards
   - append an `Integrity` card
   - append a `Retention` card
6. Lock the `Integrity` summary card to:
   - value: `String(integrity.total)` when available, otherwise `Unavailable`
   - detail: `${error} errors, ${warning} warnings, ${repairable} repairable`
   - tone: `danger` when `error > 0`, otherwise `warning` when `warning > 0` or `repairable > 0`, otherwise `success`
7. Lock the `Retention` summary card to:
   - value: `Enabled` or `Disabled` when available, otherwise `Unavailable`
   - detail: `${totalCandidates} candidates, startup on/off` when available
   - tone: `muted` when disabled, `warning` when enabled and candidates exist, otherwise `success`
8. Insert one new read-only operations section on the list page between the filters section and the inventory section.
9. Lock list-page operations-section content to:
   - an integrity summary row showing `healthy`, `warning`, `error`, `repairable`, and `skipped`
   - a retention summary row showing enabled state, startup behavior, and configured windows
   - a retention-candidate table when candidates are present
   - a normal disabled-state message when retention is off
   - an unavailable warning block when operations reads are not available
10. Lock the retention-candidate table columns to:
    - transcript
    - status
    - updated
    - age
    - window
    - archive size
11. Lock candidate-table behavior to:
    - link the transcript id to the existing detail page
    - show an empty state when preview returns zero candidates
    - never attempt transcript-specific retention predictions outside the preview payload
12. In the detail-page route flow:
    - keep `getTranscriptDetail(target)` as the authoritative page resolver
    - keep the existing unavailable-page path when transcript detail is missing
    - when base integration is `ready` and operations reads are supported, call `scanTranscriptIntegrity(target)` and `listTranscriptEvents(target, { limit: 25, offset })`
    - if either operations-read call throws, keep the page render successful and mark operations reads unavailable for the new sections only
    - if `scanTranscriptIntegrity(target)` returns `null` while transcript detail exists, treat that as operations-read unavailability for the integrity section instead of a missing transcript
13. Lock detail-page section placement to:
    - keep the existing access section first
    - insert the integrity section immediately after access
    - insert the event-history section immediately after integrity
    - keep links, participants, assets, and the right rail after the new read-only sections
14. Lock detail-page integrity-section content to:
    - an overall health badge
    - archive-safe, archive-present, document-present, and html-present facts
    - an issue table with columns `severity`, `code`, `message`, and `repairable actions`
    - a healthy empty state when a report is available and contains zero issues
    - an unavailable warning block when operations reads are not available
15. Lock detail-page event-history-section content to:
    - a table with columns `time`, `type`, `reason`, and `details`
    - event type labels produced server-side
    - event details produced by the single-line formatter
    - a pagination summary and previous/next buttons only
    - an empty state when zero events are returned
16. Lock detail-page summary-card behavior to:
    - preserve the existing transcript summary cards
    - append one `Integrity` card
    - use the integrity health label as the card value when available, otherwise `Unavailable`
    - use issue-count detail when available, otherwise the operations-unavailable warning text
17. Keep the right rail conservative:
    - preserve the facts panel
    - preserve revoke, reissue, and delete forms
    - add no repair, retention, or export controls in this slice
18. Keep plugin workbench changes minimal:
    - preserve the existing transcript workspace link
    - preserve current plugin workbench summary behavior
    - do not move the new operations overview to the plugin detail page in this slice
19. Add new locale keys under `transcripts.page.*` and `transcripts.detail.*` in `plugins/ot-dashboard/locales/english.json`.
20. Add no hardcoded English strings in the new dashboard sections.

## Service-consumer behavior requirements

- When the transcript integration itself is unavailable, keep the current page-level availability messaging unchanged.
- When the transcript integration is healthy but operations reads are unavailable, keep the list and detail pages usable for existing archive management flows and show warning panels only for the new sections.
- Known event types may receive friendly labels, but unknown types must fall back to the raw event type string.
- The dashboard must not try to derive repairability, retention eligibility, or export availability beyond what the service already reports.
- The dashboard must not reformat archive paths into filesystem actions or expose new download behavior in this slice.

## Exit criteria

- The dashboard bridge can consume event history, retention preview, and integrity reads without changing the base transcript integration contract.
- The transcript list page shows additive integrity and retention visibility while preserving current filters, pagination, and inventory behavior.
- The transcript detail page shows additive integrity and event-history visibility while preserving current revoke, reissue, and delete flows.
- Missing operations-read capability degrades to warning blocks instead of breaking the transcript workspace.
- Locale coverage exists for all new labels, empty states, warnings, and pagination copy.
- Existing transcript workspace and plugin workbench behavior remain intact.

## Verification

- `npm run build`
- `node --test dist/plugins/ot-dashboard/test/transcript-workspace.test.js`
- `node --test dist/plugins/ot-dashboard/test/operational-pages.test.js`

## Required test scenarios

- transcript list page renders the new integrity and retention summary cards when operations reads are available
- transcript list page calls `previewRetentionSweep()` and `getIntegritySummary()` only when operations reads are supported
- transcript list page renders an operations-unavailable warning without losing existing inventory data when the new methods are missing or throw
- transcript detail page renders integrity state and event history when operations reads are available
- transcript detail page calls `scanTranscriptIntegrity()` and `listTranscriptEvents()` with `limit = 25` and the correct offset derived from `eventsPage`
- transcript detail page renders previous/next event pagination controls and preserves the existing revoke, reissue, and delete forms
- transcript detail page renders an operations-unavailable warning without losing existing transcript, link, participant, or asset data when the new methods are missing or throw
- plugin workbench still links to the transcript workspace and does not regress transcript availability messaging
- new English locale keys render without raw missing-key output
- existing transcript destructive actions remain detail-page-only behavior

## Promotion gate

- Slices `06`, `07`, and `08` must be implemented and verified first.
- After slice `08`, stop, compact state into the kernel, and promote this slice in a fresh planning pass before any implementation starts.

## Out of scope

- repair, retention, export, or other mutation controls on the dashboard
- new transcript navigation, nested routes, or standalone event-history routes
- transcript-specific retention eligibility beyond the global preview payload
- changes to `ot-html-transcripts` service/runtime behavior
- plugin workbench redesign
- bulk filters, bulk actions, and export-trigger UI from slice `10`
