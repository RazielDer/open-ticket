# Slice 16: Operator Query Contracts and Filtered Summary

- Phase: `P11`
- Status: `ready-after-15`
- Depends on: `15-dashboard-self-registration-and-workbench-refactor`
- Allowed writes: `plugins/ot-html-transcripts/**` only

## Objective

Extend the slice `10` operator-list service surface with exact creator/channel filters, created-date range filtering, stable sort modes, and filtered summary counts so richer transcript search can remain service-owned before the dashboard consumer slice lands.

## Deliverables

- additive operator-query fields on the transcript operator-list contract
- additive filtered summary counts for the fully filtered result set
- repository and service behavior that applies creator/channel/date filters and stable sorting before pagination
- backend tests proving the new query surface is deterministic and preserves current operator-list semantics

## Target file plan

- `plugins/ot-html-transcripts/contracts/constants.ts`
- `plugins/ot-html-transcripts/contracts/types.ts`
- `plugins/ot-html-transcripts/storage/repository.ts`
- `plugins/ot-html-transcripts/service/transcript-service-core.ts`
- `plugins/ot-html-transcripts/service/transcript-service.ts`
- `plugins/ot-html-transcripts/README.md`
- `plugins/ot-html-transcripts/test/plugin-contract.test.ts`
- `plugins/ot-html-transcripts/test/storage.test.ts`
- `plugins/ot-html-transcripts/test/service.test.ts`

## Locked policy

- Extend the slice `10` operator-list contract, not the older base transcript-list contract.
- Add `TRANSCRIPT_OPERATIONAL_SORTS = ["created-desc", "created-asc", "updated-desc", "updated-asc"] as const`.
- Extend `TranscriptOperationalListQuery` with:
  - `creatorId?: string`
  - `channelId?: string`
  - `createdFrom?: string`
  - `createdTo?: string`
  - `sort?: TranscriptOperationalSort`
- Add `TranscriptOperationalMatchingSummary` with:
  - `total`
  - `active`
  - `partial`
  - `revoked`
  - `deleted`
  - `failed`
  - `building`
- Extend `TranscriptOperationalListResult` with:
  - `matchingSummary: TranscriptOperationalMatchingSummary`
- Keep all existing slice `10` query fields unchanged:
  - `search`
  - `status`
  - `integrity`
  - `retention`
  - `limit`
  - `offset`
- Keep `creatorId` and `channelId` exact-match only against transcript row values. This slice must not introduce fuzzy creator/channel search.
- Blank or whitespace-only `creatorId` and `channelId` are treated as omitted.
- `createdFrom` and `createdTo` accept only `YYYY-MM-DD` strings.
- Invalid `createdFrom` or `createdTo` strings are ignored rather than throwing.
- Date range filtering uses transcript `createdAt` only. Do not add a created/updated toggle in this slice.
- Lock created-date boundaries to inclusive UTC day windows:
  - `createdFrom=YYYY-MM-DD` means `created_at >= YYYY-MM-DDT00:00:00.000Z`
  - `createdTo=YYYY-MM-DD` means `created_at <= YYYY-MM-DDT23:59:59.999Z`
- If both parsed dates are valid and `createdFrom > createdTo`, return an empty result set with `total = 0` and all `matchingSummary` counts `0`.
- Invalid or omitted `sort` values fall back to `created-desc`.
- Lock sort behavior to:
  - `created-desc`: newest `createdAt` first
  - `created-asc`: oldest `createdAt` first
  - `updated-desc`: newest `updatedAt` first
  - `updated-asc`: oldest `updatedAt` first
- Lock stable ordering tie-breakers to transcript id in the same direction as the primary sort.
- Keep filtered summary semantics exact:
  - `matchingSummary` is computed across the fully filtered result set after `search`, `status`, `integrity`, `retention`, `creatorId`, `channelId`, and created-date filters are all applied
  - `matchingSummary` is computed before pagination
  - `total` remains the filtered result count and must equal `matchingSummary.total`
- Preserve existing operator-row data shape and existing slice `10` eligibility fields. This slice adds query and summary behavior only.
- Keep this slice backend-only. No `ot-dashboard` route, view, locale, or workspace changes belong here.

## Implementation tasks

1. In `contracts/constants.ts`, add the `TRANSCRIPT_OPERATIONAL_SORTS` constant and export the new union type through `contracts/types.ts`.
2. In `contracts/types.ts`, extend `TranscriptOperationalListQuery`, define `TranscriptOperationalMatchingSummary`, and extend `TranscriptOperationalListResult`.
3. In `storage/repository.ts`, extend the slice `10` operator-list query pipeline so exact `creatorId`, exact `channelId`, and created-date range filters apply before pagination.
4. Keep the existing search behavior unchanged and conjunctive with the new exact/date filters.
5. Apply existing integrity and retention filtering after the slice `10` per-row annotations remain available.
6. Compute `matchingSummary` from the fully filtered rows before pagination.
7. Apply the locked sort modes after filtering and before pagination.
8. Keep pagination behavior unchanged: `limit` and `offset` still apply after sorting.
9. In `service/transcript-service-core.ts`, validate/normalize the new query fields and pass them through to the repository.
10. Keep invalid dates non-fatal and ignored at the service boundary.
11. Keep reversed valid date windows non-fatal and return an empty filtered result.
12. In `service/transcript-service.ts`, preserve the existing method name for the operator list and return the extended result shape.
13. Update `README.md` so the operator-list contract documents the new exact filters, created-date range, sort options, and filtered summary.

## Exit criteria

- The operator-list contract accepts exact `creatorId`, exact `channelId`, `createdFrom`, `createdTo`, and `sort` without changing existing query fields.
- Filtered summary counts are returned service-side for the full filtered set before pagination.
- Sorting is stable and deterministic across all four sort modes.
- Invalid dates do not crash the query surface, and reversed valid ranges return empty filtered results.
- No implementation in this slice requires edits outside `plugins/ot-html-transcripts/**`.

## Verification

- `npm run build`
- `node --test dist/plugins/ot-html-transcripts/test/plugin-contract.test.js`
- `node --test dist/plugins/ot-html-transcripts/test/storage.test.js`
- `node --test dist/plugins/ot-html-transcripts/test/service.test.js`

## Required test scenarios

- exact `creatorId` filtering matches only transcript rows with the same creator id
- exact `channelId` filtering matches only transcript rows with the same channel id
- creator/channel exact filters combine correctly with existing `search`, `status`, `integrity`, and `retention` filters
- `createdFrom` and `createdTo` apply inclusive UTC day boundaries on transcript `createdAt`
- invalid date strings are ignored without throwing
- reversed valid date windows return zero rows and zero `matchingSummary` counts
- each sort mode returns deterministic ordering with stable id tie-breakers
- `matchingSummary` reflects the full filtered set and not just the current paginated page
- existing slice `10` operator-row eligibility fields remain intact

## Promotion gate

- Slices `06`, `07`, `08`, `09`, `10`, `11`, `12`, `13`, `14`, and `15` must be implemented and verified first.
- After slice `15`, stop, compact state into the kernel, and promote this slice in a fresh planning pass before any implementation starts.

## Out of scope

- dashboard filter controls or query-param UI
- persisted saved views
- analytics pages or reporting dashboards
- fuzzy creator/channel search
- updated-date range filtering or a created/updated toggle
- storage or schema changes beyond what the existing operator-list query surface already needs
