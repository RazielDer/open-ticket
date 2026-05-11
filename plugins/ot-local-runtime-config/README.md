# OT Local Runtime Config

`ot-local-runtime-config` is an EoTFS-local plugin that normalizes runtime config
values in memory without rewriting tracked Open Ticket config files.

It is enabled in this checkout and should not be treated as an upstream Open
Ticket plugin.

## What It Does

- Ensures the local whitelist ticket option, panel, integration profile, and
  support configuration have safe defaults when sample config still contains
  placeholders.
- Keeps tracked JSON config files unchanged while making the running local bot
  pass stricter checker expectations.
- Normalizes EoTFS whitelist bridge role and staff-guild inputs from local env
  where the bridge expects runtime-owned values.
- Sanitizes configured embeds, image URLs, colors, button colors, transcript
  modes, ticket suffixes, and Discord id lists before the runtime uses them.

## Runtime Inputs

The plugin reads local environment through Open Ticket's env manager. Important
inputs include:

- `EOTFS_OT_WHITELIST_TRANSCRIPT_CHANNEL_ID`
- `EOTFS_OT_WHITELIST_CANONICAL_STAFF_GUILD_ID`
- `EOTFS_OT_WHITELIST_BRIDGE_AUTHORIZED_ROLE_IDS`

These values are local runtime configuration. Do not commit production secrets
or production env files to this repository.

## Boundaries

- This plugin is source-side only and does not promote runtime files.
- It does not replace the released plugin READMEs for `ot-ticket-forms`,
  `ot-eotfs-bridge`, `ot-dashboard`, or `ot-html-transcripts`.
- It should stay enabled only for the EoTFS local overlay where placeholder
  config normalization is expected.
