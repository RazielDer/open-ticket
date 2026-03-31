# Per-Option Transcript Routing Plugin-Only Basis

## Goal

Document why the new per-option transcript channel routing wave can stay inside `plugins/ot-html-transcripts/**` and `plugins/ot-dashboard/**`.

## Repo-grounded findings

- The core transcript action in `src/actions/createTranscript.ts` still sends channel delivery through one static post: `opendiscord:transcripts`.
- That static post is created from `transcripts.general.channel` and gated by `transcripts.general.enableChannel`.
- The core event hooks around transcript creation do not expose the compiled result payload or ready-message objects, so a pure event-listener add-on would not have enough data to reproduce channel delivery cleanly.
- The plugin already overwrites `opendiscord:html-compiler` from `afterTranscriptCompilersLoaded`.
- The built-in `opendiscord:text-compiler` is also available by the time `afterTranscriptCompilersLoaded` fires, so it can be wrapped from the plugin layer.
- `ODTranscriptCompiler.ready()` can return DM messages separately from the channel message, so a plugin wrapper can send the channel message itself and return only the DM messages to core.
- The options checker ignores unknown object keys, so additive plugin-owned fields under `options.json` do not require edits to `src/data/framework/checkerLoader.ts`.
- The dashboard config-service deep-merges unknown fields and only normalizes known ones, so plugin-owned additive ticket-option fields can persist if the dashboard explicitly writes them.
- The dashboard option editor already has ticket-only sections and a list parser that accepts JSON arrays, commas, and newlines.

## Locked implementation consequence

The feature must be implemented as:

1. plugin-owned option-routing helpers and checker coverage
2. plugin-owned compiler wrappers for both transcript modes
3. dashboard option-editor controls that write the plugin-owned routing fields

The feature must not be implemented by editing `src/**`, `config/**`, or any other main-repo path outside the two plugin directories.

## Locked routing semantics

- Ticket-option routing contract:
  - `transcripts.useGlobalDefault:boolean`
  - `transcripts.channels:string[]`
- Missing config defaults to:
  - `useGlobalDefault = true`
  - `channels = []`
- Effective channel routing:
  - `useGlobalDefault = true` -> use `transcripts.general.channel` only when `transcripts.general.enableChannel` is true and the channel value is non-empty
  - `useGlobalDefault = false` and `channels.length > 0` -> send to the explicit per-option list
  - `useGlobalDefault = false` and `channels.length === 0` -> do not send any transcript channel post for that option
- Explicit per-option lists are independent from `transcripts.general.enableChannel`.
- Invalid, deleted, duplicate, blank, or non-text destinations must be skipped without failing transcript compilation or DM delivery.
