# Slice 20: Plugin-Owned Option Routing Contracts

- Phase: `P13`
- Status: `active`
- Depends on: `19-private-viewer-access-audit-events`
- Allowed writes: `plugins/ot-html-transcripts/**` only

## Objective

Lock a plugin-owned per-option transcript channel routing contract and validation surface that later slices can consume without editing `src/**` or core Open Ticket config typings/checkers.

## Deliverables

- plugin-owned ticket-option transcript routing contract documentation
- plugin-owned route-resolution helper for inherited default, explicit override, and explicit no-channel delivery
- plugin-owned checker coverage for additive `options.json` transcript routing fields
- tests proving the contract works without core repo edits

## Target file plan

- `plugins/ot-html-transcripts/config/register-checker.ts`
- `plugins/ot-html-transcripts/routing/option-routing.ts`
- `plugins/ot-html-transcripts/README.md`
- `plugins/ot-html-transcripts/test/plugin-contract.test.ts`

## Locked policy

- Keep this slice inside `plugins/ot-html-transcripts/**` only.
- Do not edit `src/**`, `config/**`, or core Open Ticket type declarations/checkers.
- The persisted plugin-owned routing contract for ticket options is exactly:
  - `transcripts.useGlobalDefault:boolean`
  - `transcripts.channels:string[]`
- The `transcripts` block is optional. When missing, route resolution must default to:
  - `useGlobalDefault = true`
  - `channels = []`
- This plugin-owned contract applies only to `type == "ticket"` options.
- Route resolution must read raw `opendiscord:options` config data, not new runtime option fields.
- Effective delivery semantics are locked to:
  - `useGlobalDefault = true` -> use `transcripts.general.channel` only when `transcripts.general.enableChannel` is true and `transcripts.general.channel` is non-empty
  - `useGlobalDefault = false` and `channels.length > 0` -> use the explicit per-option list
  - `useGlobalDefault = false` and `channels.length == 0` -> disable transcript channel posting for that option
- Explicit per-option channel lists are independent from `transcripts.general.enableChannel`.
- Channel-list normalization must:
  - trim whitespace
  - drop blanks
  - preserve first occurrence order
  - remove duplicates
- Checker coverage must validate:
  - `useGlobalDefault` is boolean when present
  - `channels` is an array when present
  - every explicit channel entry is a syntactically valid Discord channel id string after normalization
- This slice must not send any messages or overwrite compilers yet.

## Implementation tasks

1. Add `routing/option-routing.ts` with:
   - a raw ticket-option lookup by option id
   - normalization helpers for the plugin-owned routing block
   - effective destination resolution against `opendiscord:transcripts`
2. Lock the exported helper surface to one reusable path for later slices:
   - `readTicketOptionTranscriptRouting(optionId)`
   - `resolveEffectiveTranscriptChannelTargets(optionId)`
3. In `config/register-checker.ts`, register plugin-owned checker coverage that inspects `opendiscord:options` and reports invalid plugin-owned transcript routing fields.
4. Keep checker coverage additive and plugin-owned; do not replace the core options checker.
5. Update `README.md` to document the additive ticket-option `transcripts` block and the locked inheritance semantics.
6. Extend `test/plugin-contract.test.ts` to cover normalization, defaults, and checker behavior.

## Exit criteria

- The plugin-owned ticket-option routing contract is documented and test-covered.
- Effective route resolution is deterministic for inherited default, explicit override, and explicit no-channel delivery.
- Invalid plugin-owned route config is reported through plugin-owned checker coverage.
- No implementation in this slice requires edits outside `plugins/ot-html-transcripts/**`.

## Verification

- `npm run build`
- `node --test dist/plugins/ot-html-transcripts/test/plugin-contract.test.js`

## Required test scenarios

- missing `transcripts` block defaults to inherited global delivery
- inherited global delivery uses `transcripts.general.channel` only when enabled and non-empty
- explicit override channels are normalized by trim and dedupe rules
- explicit override channels are resolved even when `transcripts.general.enableChannel` is false
- explicit empty override disables transcript channel posting for that option
- non-ticket options ignore the plugin-owned route helper
- malformed `useGlobalDefault` and malformed `channels` values are reported by the plugin-owned checker
- malformed channel ids inside explicit override arrays are reported by the plugin-owned checker

## Promotion gate

- Slice `19` must remain implemented and verified.
- After slice `20`, update the kernel state to mark this slice completed and promote slice `21`.
- Because the user explicitly approved sequential execution, slice `21` may start immediately after that promotion if slice `20` verification passes.

## Out of scope

- compiler overwrites
- message sending
- dashboard option-editor controls
- dashboard transcript settings copy
