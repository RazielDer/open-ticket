# Slice 03: Collection, DTO Parity, and Asset Mirroring

- Phase: `P03`
- Status: `ready`
- Depends on: `02-service-storage-recovery`
- Allowed writes: `plugins/ot-html-transcripts/**` only

## Objective

Implement the end-to-end transcript data builder: full-history collection, parity with the current HTML transcript payload semantics, and bounded local asset mirroring.

## Deliverables

- full-history collector without the 2000-message cap
- plugin-owned transcript DTOs and document assembly
- asset mirror pipeline with warning and fallback behavior

## Target file plan

- `collect/full-history-collector.ts`
- `collect/message-transform.ts`
- `collect/mention-replacer.ts`
- `build/document-builder.ts`
- `assets/asset-mirror.ts`
- `assets/fallback-assets.ts`
- `assets/content-policy.ts`
- `test/collector.test.ts`
- `test/document-builder.test.ts`
- `test/assets.test.ts`

## Implementation tasks

1. Add a collector that:
   - fetches channel history in pages of `100`
   - continues until history is exhausted
   - retries transient fetch failures up to `3` times with backoff
   - does not depend on `collectAllMessages()`
2. Keep memory bounded:
   - transform messages into plugin DTOs incrementally
   - do not keep all raw discord.js messages once transformed
3. Reproduce current HTML semantics from `src/data/openticket/transcriptLoader.ts`:
   - mention replacement
   - author metadata and role colors
   - edited state and important message detection
   - reply and interaction context
   - embeds
   - buttons and dropdowns
   - reactions
   - ticket metadata and `htmlTranscriptStyle`
4. Produce a plugin-owned `document.json` model that is stable for rendering and testing.
5. Mirror locally all rendered assets:
   - attachments
   - embed media
   - avatars used by message authors and replies
   - guild icon and bot icon if rendered
   - custom emoji and stickers if rendered
   - custom background and favicon if configured
6. Enforce config bounds:
   - max bytes per file
   - max bytes per transcript
   - max asset count per transcript
   - asset mirror concurrency
7. Implement non-fatal asset failures:
   - record warning and asset row
   - mark asset as `failed` or `skipped`
   - do not leave remote URLs in final HTML output
8. Implement fallbacks:
   - generated or default local avatar placeholder
   - omit custom background or favicon when missing
   - render metadata card for unavailable attachments/media
9. Enforce safe content policy:
   - never inline or serve active `html`, `svg`, `xml`, `js`, or `pdf`
   - derive safe content type from controlled logic, not upstream MIME alone
10. Update transcript DB rows with:
   - message count
   - attachment count
   - warning count
   - total bytes
   - search text
   - participant rows
   - asset rows

## Status rules

- Asset mirror failure alone results in warnings and may downgrade the transcript to `partial`.
- Archive write, page render, or DB finalization failure remains fatal and produces transcript failure.

## Exit criteria

- A ticket with more than `2000` messages can be collected end to end.
- DTO output matches current HTML transcript semantics closely enough to keep existing ready builders useful.
- No rendered transcript depends on remote live asset URLs.
- Partial versus fatal failure boundaries are explicit and test-covered.

## Verification

- `npm run build`
- `node --test dist/plugins/ot-html-transcripts/test/collector.test.js`
- `node --test dist/plugins/ot-html-transcripts/test/document-builder.test.js`
- `node --test dist/plugins/ot-html-transcripts/test/assets.test.js`

## Out of scope

- final HTML string rendering
- public HTTP routes
- compiler registration
