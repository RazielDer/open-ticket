# Slice 01: Scaffold and Contracts

- Phase: `P01`
- Status: `ready`
- Allowed writes: `plugins/ot-html-transcripts/**` only

## Objective

Create a compilable plugin skeleton that locks the manifest, config, checker, event surface, and type contracts before any behavior work starts.

## Required reads

- `workflow.yaml`
- `evidence/planning-basis.md`
- `../../../Transcript plugin spec.md`

## Deliverables

- `plugin.json`
- `config.json`
- `README.md`
- `index.ts`
- plugin-internal type/config/bootstrap modules
- empty or minimal `test/` scaffolding suitable for later compiled `node --test`

## Target file plan

Recommended first-pass file set:

- `plugin.json`
- `config.json`
- `index.ts`
- `README.md`
- `contracts/types.ts`
- `contracts/plugin-api.ts`
- `config/load-config.ts`
- `config/register-checker.ts`
- `test/plugin-contract.test.ts`

## Implementation tasks

1. Create the plugin folder structure and keep every future module under it.
2. Add `plugin.json` with:
   - `id: "ot-html-transcripts"`
   - `startFile: "index.ts"`
   - `supportedVersions: ["OTv4.1.x"]`
   - `npmDependencies: ["sqlite3"]`
   - empty `requiredPlugins` and `incompatiblePlugins`
3. Add `config.json` with the exact defaults from the source spec.
4. Add a plugin config class and checker registration for:
   - `server.host`
   - `server.port`
   - `server.basePath`
   - `server.publicBaseUrl`
   - `storage.archiveRoot`
   - `storage.sqlitePath`
   - `links.slugBytes`
   - `queue.maxActiveTranscripts`
   - `queue.maxAssetFetches`
   - `assets.maxBytesPerFile`
   - `assets.maxBytesPerTranscript`
   - `assets.maxCountPerTranscript`
5. Implement checker rules exactly:
   - absolute `http` or `https` for `publicBaseUrl`
   - positive integer `port`
   - `slugBytes >= 16`
   - positive integer queue and asset limits
   - non-empty string paths
6. Add module augmentation for:
   - `ODPluginManagerIds_Default`
   - `ODConfigManagerIds_Default`
   - `ODCheckerManagerIds_Default`
   - `ODPluginClassManagerIds_Default`
   - slash/text command ids
   - command responder ids
   - optional message/embed ids if plugin-owned command replies are added
7. In `index.ts`, register the complete event surface needed by the repo:
   - `onPluginClassLoad`
   - `onConfigLoad`
   - `onCheckerLoad`
   - `afterTranscriptCompilersLoaded`
   - `onSlashCommandLoad`
   - `onTextCommandLoad`
   - `onCommandResponderLoad`
   - `onEmbedBuilderLoad` only if custom command embeds are added
   - `onMessageBuilderLoad` only if custom command messages are added
   - `onReadyForUsage` for server/service bootstrap
8. Keep behavior minimal in this slice:
   - service may be a stub
   - compiler override may be declared but not implemented
   - commands may register but can return a controlled "not ready" error until later slices
9. Write a plugin `README.md` that documents:
   - purpose
   - current implementation status
   - operator boundary that the plugin serves transcripts locally
   - reverse proxy expectation

## Important decisions for this slice

- Do not create any files outside the plugin folder.
- Do not create a fake alternative to `config/transcripts.json`.
- Do not register only the hook list from the source spec; include the responder hooks the repo actually requires.

## Exit criteria

- The plugin skeleton compiles.
- The checker matches the source spec.
- Type declarations exist for the service class and command ids.
- The plugin is structurally ready for storage/service implementation without revisiting the contract surface.

## Verification

- `npm run build`

## Out of scope

- SQLite schema
- archive build flow
- HTTP serving
- compiler replacement behavior
- real command execution
