# Slice 11: Link Policy and Expiry

- Phase: `P08`
- Status: `ready-after-10`
- Depends on: `10-dashboard-filters-bulk-actions-and-exports`
- Allowed writes: `plugins/ot-html-transcripts/**`, `plugins/ot-dashboard/**` only

## Objective

Add optional fixed-TTL transcript link expiry and admin-visible expiry history without changing the default share-by-slug model, deleting archives, or letting expired links push transcripts into retention cleanup.

## Deliverables

- link-policy config additions, defaults, checker updates, and README coverage
- repository and service support for expiry-managed link metadata plus normalization of elapsed links
- public transcript and asset route enforcement for expired links
- dashboard compatibility updates for expired link state in transcript detail and history views
- storage, service, HTTP, and dashboard tests covering backward-compatible default behavior and opted-in expiry behavior

## Target file plan

- `plugins/ot-html-transcripts/contracts/constants.ts`
- `plugins/ot-html-transcripts/contracts/types.ts`
- `plugins/ot-html-transcripts/config/defaults.ts`
- `plugins/ot-html-transcripts/config/register-checker.ts`
- `plugins/ot-html-transcripts/service/transcript-service-core.ts`
- `plugins/ot-html-transcripts/service/transcript-service.ts`
- `plugins/ot-html-transcripts/storage/repository.ts`
- `plugins/ot-html-transcripts/http/server.ts`
- `plugins/ot-html-transcripts/README.md`
- `plugins/ot-html-transcripts/test/plugin-contract.test.ts`
- `plugins/ot-html-transcripts/test/storage.test.ts`
- `plugins/ot-html-transcripts/test/service.test.ts`
- `plugins/ot-html-transcripts/test/http.test.ts`
- `plugins/ot-dashboard/server/transcript-service-bridge.ts`
- `plugins/ot-dashboard/server/transcript-control-center.ts`
- `plugins/ot-dashboard/public/views/sections/transcript-detail.ejs`
- `plugins/ot-dashboard/locales/english.json`
- `plugins/ot-dashboard/test/transcript-service-bridge.test.ts`
- `plugins/ot-dashboard/test/transcript-workspace.test.ts`

## Locked policy

- Keep current random-slug public sharing as the default. This slice does not add signed URLs, private dashboard-only access, query tokens, or alternate public routes.
- Lock link expiry to a fixed TTL measured in whole days from link issuance time.
- Lock expiry defaults to opt-in only:
  - `links.expiry.enabled = false`
  - `links.expiry.ttlDays = 30`
- Enabling expiry affects only links issued after the policy is enabled. Existing active links stay permanent until they are reissued or replaced by a new build.
- Expiry is link-only state. An expired link must not:
  - change transcript status to `revoked`, `deleted`, or `failed`
  - delete or sweep archive bytes
  - make a transcript retention-eligible by itself
- Public transcript and asset routes return `410 Gone` for expired links, matching the existing “no longer available” HTTP contract.
- Public transcript URLs remain slug-based at `/transcripts/:slug` and `/transcripts/:slug/assets/:assetName`.
- Admin resolution may still find expired slugs for transcript detail, search, and reissue. Public resolution may not.
- Dashboard changes in this slice are read-only compatibility updates. Do not add expiry toggles, expiry reset buttons, or new transcript mutation routes here.
- Private/dashboard-auth access modes remain deferred to slice `12`.

## Contract additions

1. Extend `OTHtmlTranscriptsConfigData.links` with:
   - `slugBytes`
   - `expiry.enabled`
   - `expiry.ttlDays`
2. Extend `TRANSCRIPT_LINK_STATUSES` with `expired`.
3. Extend `TranscriptLinkRecord` with:
   - `expiresAt`
   - `expiredAt`
4. Extend `CreateTranscriptLinkInput` in `storage/repository.ts` with:
   - `expiresAt?: string | null`
   - `expiredAt?: string | null`
5. Add `expires_at` and `expired_at` columns to the `transcript_links` table and map them into `TranscriptLinkRecord`.
6. Preserve the compiler result contract `{ url: string, availableUntil: Date }`.
7. Mirror the additive link-status and link-field changes into `plugins/ot-dashboard/server/transcript-service-bridge.ts` by extending:
   - `DASHBOARD_TRANSCRIPT_LINK_STATUSES`
   - `DashboardTranscriptLinkRecord`

## Implementation tasks

1. In `plugins/ot-html-transcripts/config/defaults.ts` add:
   - `links.expiry.enabled = false`
   - `links.expiry.ttlDays = 30`
2. In `plugins/ot-html-transcripts/config/register-checker.ts`:
   - keep `slugBytes >= 16`
   - add `ttlDays >= 1`
   - keep expiry fully nested under `links`
3. In `plugins/ot-html-transcripts/storage/repository.ts`:
   - add `expires_at` and `expired_at` to the table schema
   - migrate existing databases by adding those columns when absent
   - map them into `TranscriptLinkRecord`
   - allow `createTranscriptLink()` to persist them
4. Add repository helpers for expiry normalization that keep service/event logic deterministic:
   - list active links with non-null `expires_at <= referenceTime`
   - optionally narrow that listing by slug or transcript id for targeted reads
   - mark one still-active link as `expired` with `expired_at` and a policy reason
5. In `plugins/ot-html-transcripts/storage/repository.ts` keep transcript listing behavior stable, but change transcript search to match any stored slug in `transcript_links`, not only the current active slug, so expired-link lookups remain operator-searchable.
6. In `TranscriptServiceCore` centralize link issuance through one helper that:
   - creates a new slug
   - sets `expiresAt` only when expiry is enabled at issuance time
   - returns the same `availableUntil` used by the compiler result
7. Lock issuance rules to:
   - `compileHtmlTranscript()` creates an expiry-managed link only when `links.expiry.enabled` is true
   - `reissueTranscript()` does the same
   - links created while expiry is disabled get `expiresAt = null`
8. Add a core-only normalization helper that expires elapsed links and emits `link-expired` events.
9. Lock normalization triggers to:
   - run once at startup before the service is marked healthy
   - run before `resolveTranscript()`
   - run before `resolveAdminTarget()`
   - run before `listTranscripts()`
   - run before `getTranscriptDetail()`
   - run before public transcript and asset route serving
10. Lock normalization behavior to:
   - expire only links that are still `active`
   - ignore links with `expiresAt = null`
   - set `status = "expired"`
   - set `expiredAt` to the normalization time
   - keep `reason` as `Link expired by policy.`
   - emit one `link-expired` event per successful transition
11. Extend the slice `06` event taxonomy with `link-expired`.
12. Lock `link-expired` event details to include:
   - `linkId`
   - `slug`
   - `expiresAt`
   - `expiredAt`
   - `trigger`
13. Lock trigger values to:
   - `startup`
   - `public-route`
   - `resolve`
   - `list`
14. Keep transcript hydration rules explicit:
   - `TranscriptRecord.activeSlug` and `publicUrl` are derived only from an active unexpired link
   - when the only current link has expired, transcript status stays unchanged and transcript-level `publicUrl` becomes `null`
   - `TranscriptLinkRecord.publicUrl` stays hydrated for every stored slug so admins can still inspect historical links
15. Lock resolution behavior to:
   - `resolveTranscript(target)` rejects expired slugs
   - `resolveTranscriptAdminTarget(target)` still resolves expired slugs
   - transcript id, ticket id, and channel id resolution stay unchanged
16. In `plugins/ot-html-transcripts/http/server.ts`:
   - normalize expiry before transcript or asset lookup
   - return `410` for expired links
   - keep the existing gone message text rather than introducing an expired landing page
17. Lock admin action behavior to:
   - keep `revokeTranscript()` limited to a currently active link
   - allow `reissueTranscript()` after expiry when the archive still exists
   - keep `deleteTranscript()` marking every stored link, including expired ones, as `deleted`
18. In `plugins/ot-dashboard/server/transcript-control-center.ts`:
   - add formatting for `expiresAt` and `expiredAt`
   - add `expired` badge support using the existing badge-tone system
   - keep transcript-level `publicUrl` presentation unchanged so an expired current link naturally renders as unavailable
19. In `plugins/ot-dashboard/public/views/sections/transcript-detail.ejs` extend the link-history table with:
   - `Expires`
   - `Expired`
20. In `plugins/ot-dashboard/locales/english.json` add locale keys for:
   - the new `expired` link status
   - `linksHeaders.expires`
   - `linksHeaders.expired`
   - empty-value labels for missing expiry timestamps if needed
21. If slice `09` event history is present by the time slice `11` lands, add a friendly dashboard label for `link-expired` while preserving raw-type fallback for unknown events.

## Service-consumer behavior requirements

- The dashboard must not infer transcript-level revocation from expired link state.
- The dashboard must not expose expiry as a destructive lifecycle action.
- Expired links must remain visible in transcript detail history even when the transcript no longer has an active public URL.
- Transcript list/detail pages may show “Unavailable” for the current public URL when the latest policy-managed link has expired, but they must still allow reissue when the transcript is otherwise reissuable.
- Operator search by an old expired slug must still find the transcript through the existing transcript workspace search flow.

## Exit criteria

- The plugin supports optional fixed-TTL expiry for newly issued transcript links without changing default behavior for existing installs.
- Expired links return `410 Gone` for transcript and asset requests while leaving archive bytes and transcript status untouched.
- Existing active links remain permanent until reissued or rebuilt after the policy is enabled.
- Transcript detail shows expiry history and timestamps for stored links.
- Search, detail, and reissue flows still work for transcripts whose previous public slug has expired.
- No behavior in this slice requires edits outside `plugins/ot-html-transcripts/**` and `plugins/ot-dashboard/**`.

## Verification

- `npm run build`
- `node --test dist/plugins/ot-html-transcripts/test/plugin-contract.test.js`
- `node --test dist/plugins/ot-html-transcripts/test/storage.test.js`
- `node --test dist/plugins/ot-html-transcripts/test/service.test.js`
- `node --test dist/plugins/ot-html-transcripts/test/http.test.js`
- `node --test dist/plugins/ot-dashboard/test/transcript-service-bridge.test.js`
- `node --test dist/plugins/ot-dashboard/test/transcript-workspace.test.js`

## Required test scenarios

- config defaults and checker validation for `links.expiry.enabled` and `links.expiry.ttlDays`
- schema migration adds `expires_at` and `expired_at` without disturbing existing link rows
- enabling expiry does not retrofit existing active links with deadlines
- compile creates an expiring link and returns a real `availableUntil` when expiry is enabled
- compile keeps far-future `availableUntil` and `expiresAt = null` when expiry is disabled
- reissue after policy enablement creates a fresh expiring link while older permanent links remain historical
- startup normalization expires elapsed active links before the service reports healthy
- `resolveTranscript()` rejects an expired slug while `resolveTranscriptAdminTarget()` still finds it
- transcript list search still finds a transcript by an expired slug
- expired transcript routes return `410`
- expired asset routes return `410`
- link expiry leaves transcript status, archive path, and archive bytes unchanged
- reissue after expiry restores a new active public URL without deleting the archive
- dashboard detail renders `expired`, `expiresAt`, and `expiredAt` without breaking existing revoke/reissue/delete controls
- `link-expired` events emit only on real status transitions and not for permanent links

## Promotion gate

- Slices `06`, `07`, `08`, `09`, and `10` must be implemented and verified first.
- After slice `10`, stop, compact state into the kernel, and promote this slice in a fresh planning pass before any implementation starts.

## Out of scope

- dashboard-auth private access, signed URLs, or alternate public route models
- per-link custom TTLs or manually entered absolute expiry timestamps
- expiry-management buttons, dashboard forms, or bulk expiry operations
- archive deletion, retention execution changes, or transcript-status changes caused only by elapsed links
- changes to text transcript behavior or Open Ticket core outside the two plugin directories
