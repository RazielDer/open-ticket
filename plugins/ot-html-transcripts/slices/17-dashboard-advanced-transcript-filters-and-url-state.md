# Slice 17: Dashboard Advanced Transcript Filters and URL State

- Phase: `P11`
- Status: `ready-after-16`
- Depends on: `16-operator-query-contracts-and-filtered-summary`
- Allowed writes: `plugins/ot-dashboard/**` only

## Objective

Consume the slice `16` operator-query surface inside the existing transcript workspace by adding exact creator/channel filters, created-date range controls, sort controls, filtered-summary UI, and stronger URL-state preservation without adding new analytics pages or persisted saved views.

## Deliverables

- additive transcript list filter controls for creator id, channel id, created-date range, and sort
- filtered-summary and active-filter UI inside the existing transcript list page
- stronger query-param preservation across pagination, bulk actions, and detail back navigation
- dashboard tests proving the transcript workspace keeps its current routes and destructive-action placement while gaining the new search refinement

## Target file plan

- `plugins/ot-dashboard/server/transcript-service-bridge.ts`
- `plugins/ot-dashboard/server/transcript-control-center.ts`
- `plugins/ot-dashboard/server/routes/admin.ts`
- `plugins/ot-dashboard/public/views/sections/transcripts.ejs`
- `plugins/ot-dashboard/locales/english.json`
- `plugins/ot-dashboard/test/transcript-workspace.test.ts`
- `plugins/ot-dashboard/test/operational-pages.test.ts`

## Locked policy

- Stay inside the existing transcript workspace:
  - `GET /admin/transcripts`
  - `GET /admin/transcripts/:target`
- Do not add dedicated analytics pages, new navigation items, or persisted saved-view management in this slice.
- Extend the slice `10`/`16` transcript list query params with:
  - `creatorId`
  - `channelId`
  - `createdFrom`
  - `createdTo`
  - `sort`
- Keep existing query params unchanged:
  - `q`
  - `status`
  - `integrity`
  - `retention`
  - `limit`
  - `page`
- Filter-control behavior is locked to:
  - `creatorId`: exact transcript creator id
  - `channelId`: exact transcript channel id
  - `createdFrom`: created-date lower bound
  - `createdTo`: created-date upper bound
  - `sort`: one of the four locked slice `16` sort modes
- Lock visible sort labels to:
  - `created-desc` -> `Newest created`
  - `created-asc` -> `Oldest created`
  - `updated-desc` -> `Recently updated`
  - `updated-asc` -> `Least recently updated`
- Keep creator/channel filters as plain exact-id inputs. Do not add fuzzy lookup helpers, autocomplete, or display-name resolution in this slice.
- Preserve URL-state fully:
  - pagination links preserve all filter and sort params
  - bulk-action `returnTo` preserves all filter and sort params
  - transcript detail links append `returnTo` with the current validated list URL
  - detail-page back action uses sanitized `returnTo` when present, otherwise falls back to `/admin/transcripts`
- Lock `returnTo` sanitization to same-dashboard transcript-workspace relative paths only.
- Add one filtered-summary strip to the transcript list page between the filter form and the list inventory/bulk-action area.
- The filtered-summary strip shows the slice `16` `matchingSummary` counts for:
  - `total`
  - `active`
  - `partial`
  - `revoked`
  - `deleted`
  - `failed`
  - `building`
- Add active-filter chips only for non-default filter/sort values:
  - search query
  - status
  - integrity
  - retention
  - creator id
  - channel id
  - created-from
  - created-to
  - non-default sort
- Keep active-filter chips informational only. Do not add per-chip remove actions in this slice.
- Add one `Clear filters` action that:
  - clears `q`, `status`, `integrity`, `retention`, `creatorId`, `channelId`, `createdFrom`, `createdTo`, `sort`, and `page`
  - preserves `limit` when present and valid
- Keep destructive transcript actions detail-only and unchanged:
  - revoke
  - reissue
  - delete
- Keep bulk action behavior unchanged from slice `10`; this slice only preserves their URL-state better.
- The dashboard may assume the slice `16` operator-query service contract after promotion. Mixed-version fallback for older service shapes is out of scope because slice `17` is blocked on slice `16` in the same repo.
- Keep this slice inside `plugins/ot-dashboard/**` only.

## Implementation tasks

1. In `transcript-service-bridge.ts`, extend the operator-list query/result bridge types to mirror the slice `16` query fields and `matchingSummary`.
2. In `transcript-control-center.ts`, extend request parsing with:
   - exact `creatorId`
   - exact `channelId`
   - validated `createdFrom`
   - validated `createdTo`
   - validated `sort`
3. Drop invalid manual query-param date strings from the outbound service query and from rendered form state.
4. Preserve reversed valid date values in rendered form state and forward them unchanged to the service so the slice `16` empty-result rule stays visible to the operator.
5. Extend the existing list-href builder to preserve `creatorId`, `channelId`, `createdFrom`, `createdTo`, and `sort`.
6. Extend the transcript list page model with:
   - new filter input values
   - sort option list
   - filtered summary block
   - active-filter chip list
   - `clearFiltersHref`
7. Build `clearFiltersHref` from the current request while preserving valid `limit` only.
8. Extend per-row detail links to include validated `returnTo` for the current list state.
9. In the detail-page model, sanitize `returnTo` and use it for the back action.
10. In `routes/admin.ts`, keep route paths unchanged while passing the new list/detail state through the existing render path.
11. In `transcripts.ejs`, add the new filter inputs, sort select, filtered-summary strip, active-filter chips, and `Clear filters` action without disturbing current summary cards or inventory layout.
12. Keep bulk action controls and detail-page destructive actions in their current locations.
13. In `english.json`, add the additive transcript workspace copy for:
   - new filter labels
   - sort labels
   - filtered-summary labels
   - active-filter chip labels
   - `Clear filters`

## Exit criteria

- The transcript workspace list page supports exact creator/channel filters, created-date range filters, and sort controls without changing route paths.
- Filter, sort, and page-size state survives pagination, bulk-action redirects, and detail-page back navigation.
- The list page shows filtered-summary counts and active-filter chips for the current query state.
- `Clear filters` removes filter state while preserving valid page-size preference.
- Existing bulk actions, detail export, and destructive detail actions remain in place and unchanged.
- No implementation in this slice requires edits outside `plugins/ot-dashboard/**`.

## Verification

- `npm run build`
- `node --test dist/plugins/ot-dashboard/test/transcript-workspace.test.js`
- `node --test dist/plugins/ot-dashboard/test/operational-pages.test.js`

## Required test scenarios

- transcript list requests include `creatorId`, `channelId`, `createdFrom`, `createdTo`, and `sort` when valid
- invalid date query params are dropped from the service request and rendered as blank inputs
- reversed valid dates remain visible in the form and produce the service-provided empty result state
- pagination links preserve all active filter and sort params
- `Clear filters` clears filter params and preserves valid `limit`
- bulk action `returnTo` values preserve active query state and remain sanitized
- transcript detail back action returns to the filtered list when `returnTo` is present
- filtered-summary counts render from the service-provided `matchingSummary`
- active-filter chips render only for non-default values
- revoke, reissue, delete, and export controls remain in their existing pages and locations

## Promotion gate

- Slices `06`, `07`, `08`, `09`, `10`, `11`, `12`, `13`, `14`, `15`, and `16` must be implemented and verified first.
- After slice `16`, stop, compact state into the kernel, and promote this slice in a fresh planning pass before any implementation starts.

## Out of scope

- new analytics/reporting routes
- persisted named saved views
- fuzzy creator/channel lookup helpers
- updated-date filtering or created/updated range toggles
- bulk-action behavior changes
- transcript detail redesign beyond preserving filtered-list back navigation
