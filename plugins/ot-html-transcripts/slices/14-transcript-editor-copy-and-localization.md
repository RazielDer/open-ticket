# Slice 14: Transcript Editor Copy and Localization

- Phase: `P09`
- Status: `ready-after-13`
- Depends on: `13-transcript-preview-and-style-presets`
- Allowed writes: `plugins/ot-dashboard/**` only

## Objective

Clean up the dashboard transcript editor so it uses locale-backed copy consistently, shows human-readable labels for transcript enums, and presents the slice `13` preview and preset workflow in a clearer transcript-specific layout without changing route contracts, form field names, or transcript config persistence.

## Deliverables

- transcript-editor copy moved out of hardcoded EJS and client-side strings into the dashboard locale file
- a moderate transcript-editor information-architecture pass that better fits delivery, text output, preview/presets, and HTML style controls
- localized display labels for transcript mode, text layout, and file mode selects while preserving current stored values
- localized preset labels and descriptions in the dashboard by preset id
- static and route-level regression coverage proving transcript-editor copy stays locale-backed and persistence stays unchanged

## Target file plan

- `plugins/ot-dashboard/public/views/config-transcripts.ejs`
- `plugins/ot-dashboard/public/js/config-transcripts.js`
- `plugins/ot-dashboard/server/routes/pages.ts`
- `plugins/ot-dashboard/locales/english.json`
- `plugins/ot-dashboard/test/app.test.ts`
- `plugins/ot-dashboard/test/editor-layout.test.ts`
- `plugins/ot-dashboard/test/roundtrip.test.ts`
- `plugins/ot-dashboard/test/route-copy.test.ts`

## Locked policy

- Keep the transcript editor route family unchanged:
  - `GET /visual/transcripts`
  - `GET /visual/transcripts/preview`
  - `POST /visual/transcripts/preview`
  - `POST /api/config/transcripts`
- Keep all submitted field names unchanged. This slice must not rename, remove, or alias any `general.*`, `embedSettings.*`, `textTranscriptStyle.*`, or `htmlTranscriptStyle.*` form names.
- Keep the saved `config/transcripts.json` contract unchanged. No locale metadata, display labels, or preset presentation data may be persisted.
- Keep slice `13` preview and preset behavior intact:
  - preview still uses the existing preview routes
  - preset application stays client-side and draft-only
  - reset still restores only the HTML style inputs
  - preview/save capability degradation rules remain unchanged
- Keep the transcript editor cleanup moderate, not sweeping:
  - preserve the current hero, page route, sticky save actions, workspace/raw-editor links, and overall dashboard editor shell
  - improve transcript-editor section ordering and copy only inside the transcript editor page
  - do not redesign other visual editors or the dashboard-wide editor framework
- Remove transcript-editor hardcoded English strings from `config-transcripts.ejs` and `config-transcripts.js`. All operator-visible transcript-editor copy must come from locale-backed server-rendered keys or message payloads.
- Keep the transcript workspace copy trees unchanged under `transcripts.page.*` and `transcripts.detail.*` except where this slice needs a small adjacent wording cleanup for consistency.
- Replace the current transcript editor subtitle copy with locale-neutral wording. Lock `transcripts.subtitle` to:
  - `Control transcript delivery, preview, and styling.`
- Keep existing field-label wording one-for-one where it is already clear. The main copy changes in this slice are structural and localization-related, not a wholesale rewrite of every field caption.
- Lock the transcript-editor section structure to:
  1. transcript intro card
  2. `Transcript delivery`
  3. `Text transcript output`
  4. `HTML preview and presets`
  5. `HTML appearance`
  6. `Advanced transcript options`
- Lock section responsibilities to:
  - `Transcript delivery`: transcript enablement, delivery targets, and transcript mode
  - `Text transcript output`: text layout, file naming, and text content inclusion toggles
  - `HTML preview and presets`: preview iframe, preset picker, refresh, reset, and preview availability messaging
  - `HTML appearance`: background, header, stats, and favicon controls
  - `Advanced transcript options`: embed settings only
- Remove the current transcript-page reliance on generic `"Common settings"` and `"Advanced settings"` framing. This page should use transcript-specific section labels instead.
- Keep the transcript mode, text layout, and file mode `<option value="...">` attributes unchanged, but render locale-backed human labels for the visible text.
- Lock visible enum labels to:
  - transcript mode:
    - `html` -> `HTML transcript`
    - `text` -> `Text transcript`
  - text layout:
    - `simple` -> `Simple`
    - `normal` -> `Normal`
    - `detailed` -> `Detailed`
  - file mode:
    - `custom` -> `Custom file name`
    - `channel-name` -> `Channel name`
    - `channel-id` -> `Channel ID`
    - `user-name` -> `User name`
    - `user-id` -> `User ID`
- Keep slice `13` preset ids as the stable presentation key, but localize the displayed preset label and description in the dashboard by id.
- Do not change the slice `13` service contract for presets. The dashboard may ignore service-supplied English preset labels/descriptions for presentation, but it must still consume preset ids and draft payloads from the service.
- Keep this slice inside `plugins/ot-dashboard/**` only. No transcript-plugin service, renderer, or contract changes belong here.

## Locale and view-model additions

1. Add a dedicated transcript-editor locale subtree under `transcripts.editor.*`.
2. Lock `transcripts.editor.*` to include:
   - `introTitle`
   - `introBody`
   - `sections.delivery`
   - `sections.text`
   - `sections.preview`
   - `sections.appearance`
   - `sections.advanced`
   - `fields.*` for transcript-editor-specific field and checkbox labels
   - `enums.mode.*`
   - `enums.textLayout.*`
   - `enums.fileMode.*`
   - `preview.*` for preview-area warnings and iframe title
   - `presets.<presetId>.label`
   - `presets.<presetId>.description`
3. Keep existing `transcripts.sections.*` keys untouched for transcript-workspace usage. Do not repurpose them as the primary source for the transcript editor layout.
4. In `pages.ts`, lock the transcript-editor view model to pass:
   - `transcriptModeOptions: { value: string; label: string }[]`
   - `transcriptTextLayoutOptions: { value: string; label: string }[]`
   - `transcriptFileModeOptions: { value: string; label: string }[]`
   - `transcriptPresetDisplay: Record<string, { label: string; description: string }>`
   - `transcriptEditorMessages: Record<string, string>`
5. Lock `transcriptEditorMessages` to contain every operator-visible client-side message used by `config-transcripts.js`. The script must not embed hardcoded English fallbacks for transcript-editor copy.

## Implementation tasks

1. In `config-transcripts.ejs`, replace the current hardcoded label arrays and inline field text with locale-backed keys.
2. Keep the hero actions and sticky save actions unchanged, but add a transcript-specific intro card ahead of the main sections using:
   - `transcripts.editor.introTitle`
   - `transcripts.editor.introBody`
3. Restructure the form body to the locked section order from this slice instead of the current generic common/advanced grouping.
4. Move the current text transcript inclusion toggles out of the generic advanced block and into the `Text transcript output` section.
5. Keep the slice `13` preview/preset surface in the main editor flow under `HTML preview and presets`. Do not leave preview/presets hidden behind the advanced disclosure.
6. Move the current HTML style controls into the dedicated `HTML appearance` section in the main flow.
7. Narrow the advanced disclosure so it contains only the embed settings controls and related helper copy.
8. In `pages.ts`, build localized enum option objects from the existing runtime-aligned constants rather than hardcoding option text in the template.
9. Keep the enum source-of-truth arrays unchanged in `dashboard-contract.ts`. This slice localizes display labels; it does not move or rename the enum constants.
10. In `pages.ts`, build localized preset display metadata from stable preset ids:
    - `discord-classic`
    - `midnight-cyan`
    - `ember-slate`
    - `forest-ledger`
11. In `config-transcripts.js`, read preset labels/descriptions and any other client-facing transcript-editor strings from server-rendered JSON payloads or data blocks instead of hardcoded text.
12. Keep any client-side logic behavior unchanged unless a small DOM-selector update is required by the new section structure.
13. In `english.json`, add the full `transcripts.editor.*` subtree needed by this slice and update `transcripts.subtitle`.
14. Keep the locale strategy dashboard-local:
    - do not add new locale-loading infrastructure
    - do not add new locale files in this slice
    - do not add transcript-editor copy directly to the transcript plugin
15. Extend `route-copy.test.ts` with transcript-editor template/script checks so the migrated copy stays locale-backed and hardcoded English labels do not creep back into `config-transcripts.ejs` or `config-transcripts.js`.

## Exit criteria

- The transcript editor no longer renders hardcoded English labels or helper text from its template or client script.
- The transcript editor uses transcript-specific section titles and a clearer main-flow structure around delivery, text output, preview/presets, HTML appearance, and advanced embed options.
- The transcript mode, text layout, and file mode selects show localized human labels while keeping the same stored `value=` attributes and validation behavior.
- Preset labels and descriptions render through dashboard locale keys by preset id without changing the preset service contract or transcript config persistence.
- The transcript save route, preview routes, form field names, and persisted `config/transcripts.json` shape remain unchanged.
- No implementation in this slice requires edits outside `plugins/ot-dashboard/**`.

## Verification

- `npm run build`
- `node --test dist/plugins/ot-dashboard/test/app.test.js`
- `node --test dist/plugins/ot-dashboard/test/editor-layout.test.js`
- `node --test dist/plugins/ot-dashboard/test/roundtrip.test.js`
- `node --test dist/plugins/ot-dashboard/test/route-copy.test.js`

## Required test scenarios

- the transcript editor route still renders with the existing workspace and raw-editor entry points
- transcript mode, text layout, and file mode `<option value="...">` attributes remain runtime-aligned and unchanged
- transcript enum display text is localized and human-readable rather than raw config values
- the transcript editor section order matches the locked moderate-cleanup structure from this slice
- preview and preset surfaces remain visible in the main transcript editor flow once slice `13` is present
- transcript preview/save routes still accept the same submitted field names as before
- transcript config roundtrip tests prove no locale or presentation metadata is written into `config/transcripts.json`
- route-copy or equivalent static checks prove `config-transcripts.ejs` and `config-transcripts.js` no longer contain the migrated hardcoded English strings
- transcript preset labels and descriptions render from locale keys by preset id

## Promotion gate

- Slices `06`, `07`, `08`, `09`, `10`, `11`, `12`, and `13` must be implemented and verified first.
- After slice `13`, stop, compact state into the kernel, and promote this slice in a fresh planning pass before any implementation starts.

## Out of scope

- transcript-plugin service or renderer changes
- transcript config schema changes
- new languages or a new locale-loading system
- broader dashboard visual-editor redesign work outside the transcript editor
- transcript workspace copy overhaul outside small adjacent consistency fixes
- new preview behavior, new preset behavior, or new transcript access-policy work
