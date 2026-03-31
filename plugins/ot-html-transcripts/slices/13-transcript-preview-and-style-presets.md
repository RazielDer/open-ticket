# Slice 13: Transcript Preview and Style Presets

- Phase: `P09`
- Status: `ready-after-12`
- Depends on: `12-dashboard-private-access-mode`
- Allowed writes: `plugins/ot-html-transcripts/**`, `plugins/ot-dashboard/**` only

## Objective

Add an implementation-ready HTML transcript style workflow to the existing dashboard transcript editor by introducing built-in style presets and an authenticated preview iframe, without changing the persisted `config/transcripts.json` schema or the shipped transcript build path when preview is unused.

## Deliverables

- additive transcript-style preview and preset contracts in `ot-html-transcripts`
- a shared HTML style normalization path reused by dashboard preview and save flows
- a built-in sample transcript preview document and preview-safe renderer/CSP behavior
- preset controls, reset-to-saved behavior, preview iframe, and refresh action on the existing `visual/transcripts` page
- bridge capability detection and degraded preview handling when the transcript service is missing or outdated
- service, editor, bridge, route, and config roundtrip tests covering preview, presets, and persistence boundaries

## Target file plan

- `plugins/ot-html-transcripts/contracts/types.ts`
- `plugins/ot-html-transcripts/build/document-builder.ts`
- `plugins/ot-html-transcripts/build/style-mapper.ts`
- `plugins/ot-html-transcripts/build/preview-document.ts`
- `plugins/ot-html-transcripts/render/html-renderer.ts`
- `plugins/ot-html-transcripts/http/security.ts`
- `plugins/ot-html-transcripts/service/transcript-service-core.ts`
- `plugins/ot-html-transcripts/service/transcript-service.ts`
- `plugins/ot-html-transcripts/README.md`
- `plugins/ot-html-transcripts/test/plugin-contract.test.ts`
- `plugins/ot-html-transcripts/test/service.test.ts`
- `plugins/ot-dashboard/server/transcript-service-bridge.ts`
- `plugins/ot-dashboard/server/config-service.ts`
- `plugins/ot-dashboard/server/routes/pages.ts`
- `plugins/ot-dashboard/public/views/config-transcripts.ejs`
- `plugins/ot-dashboard/public/js/config-transcripts.js`
- `plugins/ot-dashboard/locales/english.json`
- `plugins/ot-dashboard/test/app.test.ts`
- `plugins/ot-dashboard/test/editor-layout.test.ts`
- `plugins/ot-dashboard/test/roundtrip.test.ts`
- `plugins/ot-dashboard/test/transcript-service-bridge.test.ts`

## Locked policy

- Keep `config/transcripts.json` as the only persisted source of transcript mode, recipients, and `htmlTranscriptStyle`. This slice must not add a second saved preset registry or any new transcript config keys.
- Keep the existing `POST /api/config/transcripts` save route as the only persistence path. Preview must never write config.
- Keep the existing `visual/transcripts` page as the only transcript editor surface. Do not add a second visual editor, modal-only editor, or transcript-style page.
- Preview source is a built-in sample transcript document only. Do not preview live ticket data, archived transcripts, or any runtime-selected transcript in this slice.
- Preview is dashboard-admin only. It is not part of the public slug routes or the private viewer routes from slice `12`.
- Preview remains available even when `general.mode = "text"`, because it edits the dormant `htmlTranscriptStyle` subtree rather than current delivery behavior.
- Preview interaction is explicit:
  - a dedicated `Refresh preview` action renders the current draft into the iframe
  - applying a preset does not auto-save
  - applying a preset does not auto-refresh
- The reset action is style-scoped only. It restores `htmlTranscriptStyle.*` inputs from the currently saved config and must not overwrite unsaved `general`, `embedSettings`, or `textTranscriptStyle` edits on the same page.
- Built-in presets are UI-only and service-owned. They are not written to config as named presets and are not editable in this slice.
- Keep the built-in preset catalog fixed to:
  1. `discord-classic`
     - label: `Discord Classic`
     - description: `Keeps the familiar Discord charcoal and gold transcript look.`
     - background `#101318`
     - header `#202225`
     - accent `#f8ba00`
     - text `#ffffff`
     - stats `#202225 / #8b919c / #ffffff / #40444a / #ffffff`
  2. `midnight-cyan`
     - label: `Midnight Cyan`
     - description: `Cool blue contrast with a brighter operational accent.`
     - background `#08131d`
     - header `#0f2230`
     - accent `#3dd9eb`
     - text `#eafcff`
     - stats `#0c1b28 / #7cb9c5 / #eafcff / #153447 / #dcfbff`
  3. `ember-slate`
     - label: `Ember Slate`
     - description: `Warmer dark neutrals with orange emphasis for alert-heavy archives.`
     - background `#1a120f`
     - header `#2a1c19`
     - accent `#ff8a3d`
     - text `#fff4eb`
     - stats `#2b201d / #d4a88c / #fff4eb / #57372d / #fff2e6`
  4. `forest-ledger`
     - label: `Forest Ledger`
     - description: `Muted greens tuned for softer long-form reading.`
     - background `#0d1712`
     - header `#163125`
     - accent `#7ccf7a`
     - text `#effcf2`
     - stats `#13281f / #9bc2a5 / #effcf2 / #2d4b3a / #effcf2`
- Every built-in preset must set:
  - `background.enableCustomBackground = true`
  - `header.enableCustomHeader = true`
  - `stats.enableCustomStats = true`
  - `favicon.enableCustomFavicon = false`
  - `background.backgroundImage = ""`
  - `favicon.imageUrl = ""`
- Preview rendering must reuse the transcript HTML renderer, but with additive preview-only behavior:
  - preview may render direct `background.backgroundImage` and `favicon.imageUrl` URLs when their enable flags are on
  - production archive rendering must keep its current mirrored-asset behavior unchanged
- Preview responses must use a dedicated iframe-safe CSP:
  - allow embedding by the dashboard itself with `frame-ancestors 'self'`
  - keep `script-src 'none'`
  - allow remote `http:` and `https:` image loads so preview-only background and favicon URLs can render
  - do not relax the production public transcript CSP
- Degrade explicitly when preview capability is unavailable:
  - the transcript editor still loads and the normal save route still works
  - preset and preview surfaces show an unavailable warning instead of crashing
  - preview routes return a small `503` HTML placeholder instead of a broken stack trace
- Keep broader transcript editor copy cleanup and localization restructuring out of this slice. Slice `14` still owns that follow-on polish.

## Contract additions

1. In `plugins/ot-html-transcripts/contracts/types.ts` add:
   - `TranscriptStylePresetId`
   - `TranscriptHtmlStyleDraft`
   - `TranscriptStylePreset`
   - `TranscriptStylePreviewResult`
2. Lock `TranscriptStylePresetId` to:
   - `"discord-classic" | "midnight-cyan" | "ember-slate" | "forest-ledger"`
3. Lock `TranscriptHtmlStyleDraft` to the exact current `htmlTranscriptStyle` subtree:
   - `background.enableCustomBackground`
   - `background.backgroundColor`
   - `background.backgroundImage`
   - `header.enableCustomHeader`
   - `header.backgroundColor`
   - `header.decoColor`
   - `header.textColor`
   - `stats.enableCustomStats`
   - `stats.backgroundColor`
   - `stats.keyTextColor`
   - `stats.valueTextColor`
   - `stats.hideBackgroundColor`
   - `stats.hideTextColor`
   - `favicon.enableCustomFavicon`
   - `favicon.imageUrl`
4. Lock `TranscriptStylePreset` to:
   - `id`
   - `label`
   - `description`
   - `draft`
5. Lock `TranscriptStylePreviewResult` to:
   - `status`
   - `message`
   - `html`
   - `contentSecurityPolicy`
6. Lock `TranscriptStylePreviewResult.status` to:
   - `"ok" | "unavailable"`
7. Extend `OTHtmlTranscriptService` and `TranscriptServiceCore` with additive methods:
   - `listTranscriptStylePresets(): Promise<TranscriptStylePreset[]>`
   - `renderTranscriptStylePreview(styleDraft: TranscriptHtmlStyleDraft): Promise<TranscriptStylePreviewResult>`
8. Mirror the additive types into `plugins/ot-dashboard/server/transcript-service-bridge.ts` with `Dashboard`-prefixed equivalents and matching method names.

## Implementation tasks

1. Extract a shared transcript-document style mapper into `plugins/ot-html-transcripts/build/style-mapper.ts`.
2. Lock the shared mapper to:
   - accept `TranscriptHtmlStyleDraft`
   - return `LocalTranscriptDocument["style"]`
   - preserve the current fallback colors already used by `build/document-builder.ts`
3. Update `build/document-builder.ts` to use the shared style mapper so preview and archive builds cannot drift on color and enable-flag handling.
4. Add `plugins/ot-html-transcripts/build/preview-document.ts` with one built-in sample `LocalTranscriptDocument`.
5. Lock the sample preview document to include:
   - header and ticket metadata
   - the six current stat cards
   - at least one warning row
   - one normal message
   - one edited message
   - one reply preview
   - one embed with fields
   - one reactions row
   - one buttons row
   - one dropdown row
   - one image-style attachment row
   - one file-style attachment row
6. Keep the preview document self-contained and deterministic. Do not read runtime tickets, archives, or Discord APIs to build it.
7. In `plugins/ot-html-transcripts/render/html-renderer.ts` add preview-only direct asset URL support behind an explicit renderer option.
8. Lock renderer behavior to:
   - keep current archive output unchanged by default
   - use direct `sourceUrl` only when preview mode is explicitly enabled and `assetName` is missing
   - allow that direct-URL path only for favicon and background assets in this slice
9. In `plugins/ot-html-transcripts/http/security.ts` add a dedicated preview CSP builder for the iframe route rather than weakening the public transcript CSP.
10. In `TranscriptServiceCore.listTranscriptStylePresets()` return the exact four built-in presets from this slice with their locked ids, labels, descriptions, and draft payloads.
11. In `TranscriptServiceCore.renderTranscriptStylePreview(styleDraft)`:
    - build the preview document from the shared style mapper plus the sample fixture
    - render HTML with preview-mode direct asset URLs enabled
    - return the preview HTML plus the preview CSP
    - return `status = "unavailable"` with a small explanatory HTML body when the service is unhealthy
12. Keep preview rendering additive only. Do not add transcript preview caching, persisted temp files, or background jobs in this slice.
13. In `plugins/ot-dashboard/server/transcript-service-bridge.ts`:
    - keep the current base transcript integration check unchanged
    - add a second preview-capability predicate that requires `listTranscriptStylePresets` and `renderTranscriptStylePreview`
    - keep the rest of the transcript workspace usable when those methods are absent
14. In `plugins/ot-dashboard/server/config-service.ts` extract a shared HTML-style normalization helper from `saveTranscriptsForm(...)`.
15. Lock the normalization helper to:
    - accept arbitrary form-shaped input
    - normalize only the current `htmlTranscriptStyle` keys
    - ignore preview-only controls and client-only helper fields
    - return the exact persisted style shape with no new keys
16. Keep `saveTranscriptsForm(...)` behavior the same, except that it now reuses the shared HTML-style helper before writing `config/transcripts.json`.
17. In `plugins/ot-dashboard/server/routes/pages.ts` extend the existing `GET /visual/transcripts` route to:
    - resolve base transcript integration as it does today
    - resolve preview capability separately
    - load presets only when preview capability is available
    - pass the saved HTML style draft, preset catalog, preview availability state, and preview endpoint URLs into the template
18. Add preview routes on the existing page router:
    - `GET /visual/transcripts/preview`
    - `POST /visual/transcripts/preview`
19. Lock preview route behavior to:
    - require the existing dashboard admin auth
    - rely on the existing CSRF middleware for `POST`
    - render raw transcript HTML only, with no dashboard shell
    - use saved config for `GET`
    - use the shared HTML-style normalization helper against `req.body` for `POST`
    - return `200` plus preview HTML and the preview CSP when available
    - return `503` plus a small HTML placeholder when preview capability is unavailable
20. In `plugins/ot-dashboard/public/views/config-transcripts.ejs` keep the current form and save action, then add:
    - a preset section scoped to HTML styles
    - a `Reset style to saved values` action
    - a named preview iframe
    - a `Refresh preview` action that targets that iframe
    - hidden JSON payloads for the saved style draft and preset catalog
    - script tags for `dashboard-ui.js` and the new `config-transcripts.js`
21. Lock the visual-editor interaction model to:
    - keep preset application client-side only
    - use the existing page form for preview submission via `formaction` and `formtarget`
    - avoid creating a second persistence form or fetch-only mutation path
22. Add `plugins/ot-dashboard/public/js/config-transcripts.js` and lock it to:
    - hydrate the saved style draft and preset catalog from the template payloads
    - apply a chosen preset to `htmlTranscriptStyle.*` inputs only
    - reset `htmlTranscriptStyle.*` inputs only
    - leave non-style transcript settings untouched
    - keep preview refresh explicit rather than auto-live
23. In `plugins/ot-dashboard/locales/english.json` add only the new strings required for preset labels, preset descriptions, preview actions, preview warnings, and iframe titles.
24. Update `plugins/ot-html-transcripts/README.md` so the service-method list includes the additive preview and preset methods and the styling workflow notes that presets remain dashboard-side draft helpers rather than saved config.

## Dashboard editor behavior requirements

- Initial page load must point the iframe at the saved-style preview `GET` route when preview capability is available.
- The preview iframe must not render admin navigation, dashboard chrome, or action controls.
- The preview section must remain visible even when transcript mode is currently `text`.
- If preview capability is unavailable, the page must render a warning block in the preview area and avoid showing a broken empty iframe.
- Applying a preset must not modify the saved-success banner, submit the form, or trigger the route redirect.
- Resetting to saved style values must restore only the HTML style inputs from the last persisted config state on disk.

## Exit criteria

- The transcript visual editor shows a built-in preset catalog and a working preview iframe without introducing a second saved transcript config format.
- Preview GET uses saved config, preview POST uses the unsaved current draft, and neither route mutates `config/transcripts.json`.
- Preview rendering reuses the transcript HTML renderer while allowing preview-only direct background and favicon URLs.
- The preview iframe CSP allows same-dashboard embedding and remote preview images without relaxing the public transcript CSP.
- The dashboard editor degrades to an unavailable warning when the transcript service lacks the new preview methods, while the existing save flow still works.
- No implementation in this slice requires edits outside `plugins/ot-html-transcripts/**` and `plugins/ot-dashboard/**`.

## Verification

- `npm run build`
- `node --test dist/plugins/ot-html-transcripts/test/plugin-contract.test.js`
- `node --test dist/plugins/ot-html-transcripts/test/service.test.js`
- `node --test dist/plugins/ot-dashboard/test/app.test.js`
- `node --test dist/plugins/ot-dashboard/test/editor-layout.test.js`
- `node --test dist/plugins/ot-dashboard/test/roundtrip.test.js`
- `node --test dist/plugins/ot-dashboard/test/transcript-service-bridge.test.js`

## Required test scenarios

- the transcript service exposes the additive preset and preview methods without changing the existing compiler or action surface
- `listTranscriptStylePresets()` returns the exact locked preset ids and draft values from this slice
- preview rendering uses the sample document, not any live transcript or runtime data
- preview rendering returns iframe-safe CSP with `frame-ancestors 'self'` and remote image allowance while production public transcript CSP remains unchanged
- preview rendering can show enabled direct background and favicon URLs without requiring mirrored assets
- the shared HTML-style normalizer produces the same persisted shape for save flows as before and ignores preview-only fields
- `GET /visual/transcripts/preview` requires auth and renders the saved HTML style draft
- `POST /visual/transcripts/preview` requires auth plus CSRF and renders unsaved draft values without persisting them
- the transcript editor page renders the preset section, refresh action, reset action, and preview iframe when preview capability is available
- applying a preset updates only HTML style inputs
- resetting style to saved values restores only HTML style inputs
- the existing save flow still writes `config/transcripts.json` correctly and does not persist preset metadata or preview-only controls
- preview capability missing from the transcript service degrades to a warning state while the normal transcript settings form still saves

## Promotion gate

- Slices `06`, `07`, `08`, `09`, `10`, `11`, and `12` must be implemented and verified first.
- After slice `12`, stop, compact state into the kernel, and promote this slice in a fresh planning pass before any implementation starts.

## Out of scope

- live transcript or live ticket preview selection
- auto-refresh or keystroke-live preview
- saved custom preset libraries, import/export, or preset CRUD
- transcript-style validation beyond the existing normalized key set
- viewer-surface transcript chrome changes, private-view changes, or transcript access-policy work
- broad transcript editor copy or localization cleanup beyond the exact new strings required for this slice
