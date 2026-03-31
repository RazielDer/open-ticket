# Slice 22: Dashboard Option Editor Routing Controls

- Phase: `P13`
- Status: `ready-after-21`
- Depends on: `21-compiler-wrapper-delivery-routing`
- Allowed writes: `plugins/ot-dashboard/**`, `plugins/ot-html-transcripts/**` only

## Objective

Expose the plugin-owned transcript channel routing controls in the existing ticket option editor, keep them visually aligned with the current dashboard theme, and update transcript-facing copy so operators understand the global-default versus per-option override model.

## Deliverables

- ticket-option transcript routing controls in the dashboard option workspace
- save/load support for the plugin-owned `transcripts` block
- stripping of ticket-only routing fields from non-ticket options on save
- transcript settings/workbench copy that explains global default versus per-option overrides
- dashboard tests proving the editor and copy changes stay stable

## Target file plan

- `plugins/ot-dashboard/server/config-service.ts`
- `plugins/ot-dashboard/public/views/config-options.ejs`
- `plugins/ot-dashboard/public/js/config-options.js`
- `plugins/ot-dashboard/locales/english.json`
- `plugins/ot-html-transcripts/dashboard-workbench.ts`
- `plugins/ot-html-transcripts/README.md`
- `plugins/ot-dashboard/test/roundtrip.test.ts`
- `plugins/ot-dashboard/test/editor-layout.test.ts`
- `plugins/ot-dashboard/test/transcript-workspace.test.ts`
- `plugins/ot-dashboard/test/operational-pages.test.ts`

## Locked policy

- Keep all writes inside `plugins/ot-dashboard/**` and `plugins/ot-html-transcripts/**`.
- Do not edit core dashboard routes or create a new settings page.
- Put the new controls inside the existing ticket option editor flow.
- The editor controls are locked to:
  - one explicit inherit toggle: `Use global transcript default`
  - one destination-id textarea for explicit override channels
- UI semantics are locked to:
  - `Use global transcript default = true` -> explicit channel textarea is disabled/read-only and helper copy explains that the option inherits the global transcript settings page default
  - `Use global transcript default = false` -> explicit channel textarea is enabled and helper copy explains that comma-separated, newline-separated, or JSON-array channel ids are accepted
  - enabled textarea left empty while inheritance is off means no transcript channel post for that option
- The dashboard must initialize existing ticket options that lack the plugin-owned `transcripts` block as:
  - `useGlobalDefault = true`
  - `channels = []`
- The dashboard save path must strip the plugin-owned transcript routing block from non-ticket options.
- The new UI must reuse the existing `section-card`, `form-grid`, helper-copy, checkbox, and textarea patterns so it stays visually consistent with the dashboard theme.
- Update transcript-facing copy so operators are told:
  - the global transcript channel now acts as the default channel for inheriting options
  - per-option transcript channel overrides live in the ticket option editor
- Do not add new navigation items, modals, or plugin registry surfaces in this slice.

## Implementation tasks

1. In `config-service.ts`, normalize and persist the plugin-owned `transcripts` block for ticket options.
2. In `config-service.ts`, explicitly remove that block from role and website options on save.
3. In `config-options.js`, load, render, collect, and serialize:
   - `transcripts.useGlobalDefault`
   - `transcripts.channels`
4. Reuse `DashboardUI.parseList` and `DashboardUI.stringifyList` for explicit channel id handling.
5. In `config-options.ejs`, add the transcript delivery block inside the ticket-option workspace using existing dashboard card/layout patterns.
6. In `english.json`, add the new option-editor labels, helper copy, and transcript-settings/workbench copy updates.
7. In `dashboard-workbench.ts` and `README.md`, update transcript wording so the global transcript settings page is clearly the default/fallback channel source and the option editor is the override location.
8. Extend the dashboard tests to cover save/load, rendering, and transcript copy behavior.

## Exit criteria

- Ticket options can configure inherit-vs-override transcript routing inside the existing dashboard option editor.
- Non-ticket options do not retain the plugin-owned ticket transcript routing block after save.
- Transcript settings/workbench copy correctly describes the new default/override model.
- The dashboard layout and tests remain stable.
- No implementation in this slice requires edits outside `plugins/ot-dashboard/**` or `plugins/ot-html-transcripts/**`.

## Verification

- `npm run build`
- `npm --prefix plugins/ot-dashboard run build:editor`
- `node --test dist/plugins/ot-dashboard/test/roundtrip.test.js dist/plugins/ot-dashboard/test/editor-layout.test.js dist/plugins/ot-dashboard/test/transcript-workspace.test.js dist/plugins/ot-dashboard/test/operational-pages.test.js`
- `node --test dist/plugins/ot-html-transcripts/test/plugin-contract.test.js dist/plugins/ot-html-transcripts/test/end-to-end.test.js`

## Required test scenarios

- roundtrip save/load preserves ticket-option transcript routing fields
- role and website option saves strip the plugin-owned ticket transcript routing block
- ticket option editor renders the inherit toggle and explicit channel field in the existing workspace
- explicit channel field is disabled when inheritance is on and enabled when inheritance is off
- explicit channel field uses the existing list parser/serializer semantics
- transcript settings/workbench copy reflects the global-default plus per-option override model
- transcript workspace and plugin detail pages keep their existing actions while showing updated copy

## Promotion gate

- Slices `20` and `21` must be implemented and verified first.
- After slice `22`, update the kernel state and run the locked final verification commands.

## Out of scope

- new transcript settings pages
- dashboard navigation changes
- core option typings/checkers
- transcript content or DM recipient changes
