# Slice 21: Compiler Wrapper Delivery Routing

- Phase: `P13`
- Status: `ready-after-20`
- Depends on: `20-plugin-owned-option-routing-contracts`
- Allowed writes: `plugins/ot-html-transcripts/**` only

## Objective

Implement plugins-only transcript channel delivery routing by wrapping both transcript compilers and sending channel messages directly from the plugin layer, while preserving current compile results, DM behavior, and core retry/error flows.

## Deliverables

- plugin-owned wrapper for `opendiscord:text-compiler`
- updated plugin-owned wrapper for `opendiscord:html-compiler`
- reusable direct channel-delivery helper
- end-to-end tests covering inherited default, explicit override, and explicit no-channel routing

## Target file plan

- `plugins/ot-html-transcripts/index.ts`
- `plugins/ot-html-transcripts/compiler/html-compiler.ts`
- `plugins/ot-html-transcripts/compiler/text-compiler.ts`
- `plugins/ot-html-transcripts/routing/option-routing.ts`
- `plugins/ot-html-transcripts/routing/channel-delivery.ts`
- `plugins/ot-html-transcripts/test/compiler.test.ts`
- `plugins/ot-html-transcripts/test/end-to-end.test.ts`
- `plugins/ot-html-transcripts/test/plugin-contract.test.ts`

## Locked policy

- Keep this slice inside `plugins/ot-html-transcripts/**` only.
- Do not edit `src/**`.
- Wrap compilers from `afterTranscriptCompilersLoaded`.
- For text mode:
  - capture the original built-in `opendiscord:text-compiler`
  - delegate compile behavior to the original compiler
  - delegate ready-message building to the original compiler before routing channel delivery
- For html mode:
  - preserve the local service-backed compile behavior
  - preserve the html compile result shape `{ url:string, availableUntil:Date }`
  - build ready messages exactly as before, then route the channel delivery directly from the plugin
- The wrapper ready path must:
  - resolve effective destination ids from slice `20`
  - send the channel message directly to each resolved guild text channel
  - return only the DM messages to core so the static core post path does not duplicate channel sends
- Explicit per-option overrides send regardless of `transcripts.general.enableChannel`.
- Inherited default delivery uses `transcripts.general.channel` only when `transcripts.general.enableChannel` is true and the channel value is non-empty.
- If no effective destinations exist, skip channel delivery silently and still return DM messages.
- Destination send failures must:
  - log a plugin warning with the option id and destination id when available
  - continue sending to remaining destinations
  - never fail transcript compilation or suppress DM delivery
- Invalid, missing, deleted, or non-text destination channels must be skipped and logged.
- Preserve current DM recipient semantics:
  - creator
  - participant
  - active admin
  - every admin
- Do not change transcript contents, file output, embed copy, retry flow, error flow, or visit-button behavior.
- Do not introduce a new pending-message experience in this phase.

## Implementation tasks

1. Add `routing/channel-delivery.ts` with direct destination send helpers that:
   - fetch guild text channels
   - send `ODMessageBuildResult`
   - collect non-fatal delivery failures for logging
2. Update `compiler/html-compiler.ts` so the plugin-owned html compiler sends channel messages through the delivery helper and returns only DM messages.
3. Add `compiler/text-compiler.ts` that wraps the built-in text compiler and routes channel delivery through the same helper.
4. Update `index.ts` so both wrapper registrations happen during transcript compiler load.
5. Keep route-resolution logic centralized in the slice `20` helper instead of duplicating it inside the compiler wrappers.
6. Extend `compiler.test.ts` and `end-to-end.test.ts` to cover both transcript modes and the three routing states.

## Exit criteria

- Both transcript modes route channel delivery through plugin-owned wrappers only.
- Explicit override channels, inherited default channels, and explicit no-channel delivery all behave as locked.
- Channel-delivery failures stay non-fatal.
- DM behavior and html compile-result shape remain unchanged.
- No implementation in this slice requires edits outside `plugins/ot-html-transcripts/**`.

## Verification

- `npm run build`
- `node --test dist/plugins/ot-html-transcripts/test/plugin-contract.test.js dist/plugins/ot-html-transcripts/test/compiler.test.js dist/plugins/ot-html-transcripts/test/end-to-end.test.js`

## Required test scenarios

- text mode explicit override sends to all normalized per-option destinations
- html mode explicit override sends to all normalized per-option destinations
- explicit override still sends when `transcripts.general.enableChannel` is false
- inherited default uses the global channel only when enabled and configured
- explicit no-channel delivery returns DM messages and posts no transcript channel message
- duplicate explicit channels only send once
- invalid or non-text destinations are skipped without failing transcript creation
- one failed destination does not prevent later destinations from receiving the channel message
- text transcript contents remain unchanged after the wrapper is introduced
- html compile result shape remains unchanged after the wrapper is introduced

## Promotion gate

- Slice `20` must be implemented and verified first.
- After slice `21`, update the kernel state to mark this slice completed and promote slice `22`.
- Because the user explicitly approved sequential execution, slice `22` may start immediately after that promotion if slice `21` verification passes.

## Out of scope

- dashboard editor controls
- dashboard locale/copy changes
- core action rewrites
- pending-message UX redesign
