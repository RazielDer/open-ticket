# `ot-html-transcripts`

`ot-html-transcripts` is the local transcript archive, renderer, HTTP host, and transcript service plugin for Open Ticket. It replaces the built-in remote HTML transcript flow with a plugin-local pipeline and remains the source of truth for transcript files, slug lifecycle, retention, and transcript service APIs.

## What It Does By Itself

When used on its own, the plugin:

- collects full ticket history without the built-in `2000` message cap
- renders local HTML transcripts
- mirrors referenced assets into a local archive
- stores transcript rows, slugs, participants, assets, and lifecycle events in SQLite
- serves transcript pages from a local HTTP host in `public` mode
- exposes transcript operations through `ot-html-transcripts:service`

## EoTFS Pairing

In the EoTFS stack, this plugin pairs with:

- [`../ot-dashboard/README.md`](../ot-dashboard/README.md) for Discord-gated browser viewing in `private-discord` mode
- [`../ot-eotfs-bridge/README.md`](../ot-eotfs-bridge/README.md) for transcript URL lookup and later `transcript_attached` delivery into the staged whitelist workflow
- [`../../../../EoTFS Discord Bot/docs/host-admin/README.md`](../../../../EoTFS Discord Bot/docs/host-admin/README.md) for the Discord-side intake worker and host coordination contract

## What Changes When `ot-dashboard` Is Installed

`ot-dashboard` is optional in public mode and required in `private-discord` mode.

When the dashboard is installed and `links.access.mode = "private-discord"`:

- canonical transcript URLs move to the dashboard viewer host
- Discord-gated browser access comes from the dashboard viewer routes
- `My Transcripts` becomes the end-user discovery surface
- global transcript inventory stays on the dashboard admin host

The transcript files, slugs, events, retention, and export logic still belong to `ot-html-transcripts`.

## What You Need To Fill Out

Three different config files matter.

### 1. `plugins/ot-html-transcripts/config.json`

This file controls the plugin's local host, storage, access mode, queue limits, asset limits, and retention policy.

Current keys:

- `server.host`
- `server.port`
- `server.basePath`
- `server.publicBaseUrl`
- `storage.archiveRoot`
- `storage.sqlitePath`
- `links.slugBytes`
- `links.expiry.enabled`
- `links.expiry.ttlDays`
- `links.access.mode`
- `queue.maxActiveTranscripts`
- `queue.maxAssetFetches`
- `assets.maxBytesPerFile`
- `assets.maxBytesPerTranscript`
- `assets.maxCountPerTranscript`
- `retention.enabled`
- `retention.runOnStartup`
- `retention.maxTranscriptsPerRun`
- `retention.statuses.failedDays`
- `retention.statuses.revokedDays`
- `retention.statuses.deletedDays`

What to change from the shipped sample:

- Replace the local dev `server.publicBaseUrl` when staying in `public` mode.
- Switch `links.access.mode` to `private-discord` only after `ot-dashboard` is installed and configured.
- Move `storage.archiveRoot` and `storage.sqlitePath` if your deployment needs a different storage location.
- Review the retention window defaults before production use.

Checker expectations:

- `links.access.mode` must be `public` or `private-discord`
- `server.publicBaseUrl` must be an absolute `http` or `https` URL in `public` mode
- `server.publicBaseUrl` may be empty in `private-discord` mode
- `links.slugBytes` must be at least `16`
- numeric queue, asset, and retention limits must stay positive

### 2. `config/transcripts.json`

This is still the source of truth for transcript mode, transcript recipients, and transcript style.

Fields operators typically fill out:

- `general.enabled`
- `general.enableChannel`
- `general.enableCreatorDM`
- `general.enableParticipantDM`
- `general.enableActiveAdminDM`
- `general.enableEveryAdminDM`
- `general.channel`
- `general.mode`
- `htmlTranscriptStyle.*`

Important rule:

- `general.mode` must be `html` for this plugin to own the HTML transcript flow.

### 3. `config/options.json`

Per-option transcript routing is additive and ticket-option only.

Example block:

```json
{
  "id": "billing",
  "type": "ticket",
  "transcripts": {
    "useGlobalDefault": false,
    "channels": ["123456789012345678", "234567890123456789"]
  }
}
```

Locked routing rules:

- omit the `transcripts` block to inherit the global default
- `useGlobalDefault = true` means the option inherits `config/transcripts.json -> general.channel` only when global channel posting is enabled
- `useGlobalDefault = false` means `channels` is the complete explicit destination list
- `useGlobalDefault = false` with an empty list disables transcript channel posting for that option
- duplicate or blank channel ids are normalized away

## Public Mode Vs `private-discord` Mode

### `public`

Use `public` when you want direct transcript links from this plugin's local HTTP host.

Routes:

- `GET /health`
- `GET /transcripts/:slug`
- `GET /transcripts/:slug/assets/:assetName`

If `server.basePath` is not `/`, those routes live under the configured prefix.

### `private-discord`

Use `private-discord` when you want transcript viewing to require Discord membership and dashboard viewer auth.

Behavior changes:

- the plugin's public slug routes intentionally return `404`
- the dashboard viewer host becomes the canonical transcript surface
- transcript URLs resolve through `ot-dashboard`

Viewer access rules remain locked:

- creators require current guild membership
- staff viewers require current guild membership, live `Reviewer` or higher access, and a stored transcript participant role of `admin`
- stored participant role `participant` never grants browser viewer access
- owner override can open a transcript directly but does not populate `My Transcripts`

## Transcript Lifecycle

Archive layout per transcript:

- `runtime/ot-html-transcripts/transcripts/<transcriptId>/index.html`
- `runtime/ot-html-transcripts/transcripts/<transcriptId>/document.json`
- `runtime/ot-html-transcripts/transcripts/<transcriptId>/assets/*`

SQLite tracks:

- transcript rows and lifecycle status
- active, superseded, revoked, deleted, and expired slugs
- participants
- mirrored assets
- transcript event history

Lifecycle notes:

- expired links return `410 Gone`
- revoked, deleted, or unknown links return `404`
- asset fetch issues can still produce a transcript with partial status when the failure is non-fatal
- retention sweeps can prune failed, revoked, and deleted transcript states based on your configured windows

## Routing, Retention, Integrity, And Export

Routing:

- global/default channel routing lives in `config/transcripts.json`
- per-option routing overrides live in `config/options.json`

Retention:

- controlled by the `retention.*` block in the plugin config
- can run on startup
- is bounded by `maxTranscriptsPerRun`

Integrity and export:

- the service tracks transcript events for operational visibility
- integrity summary and detail scans remain service-owned
- exports are prepared and released by the transcript service rather than by other plugins poking archive files directly

## Admin Commands And Common Tasks

The plugin registers one slash command and one text command named `transcript`.

Actions:

- `get`
- `revoke`
- `reissue`
- `delete`

Targets can be:

- transcript id
- slug
- ticket id
- channel id

Examples:

- `/transcript action:get target:slug_here`
- `/transcript action:revoke target:ticket_id reason:staff request`
- `!transcript reissue channel_id rotated link`
- `!transcript delete transcript_id cleanup`

Common operator tasks:

- confirm the plugin is healthy with `/health` in public mode
- retrieve the current transcript record for a ticket
- revoke a link without deleting the archive
- reissue a slug after rotation
- delete a transcript when policy requires full removal
- switch to `private-discord` mode only after the dashboard viewer host is ready

## What End Users See

In public mode:

- a transcript link opens directly in the browser
- asset URLs load from the plugin's asset route

In private mode:

- the user signs in through Discord on the dashboard viewer host
- if they are allowed, they can open the transcript or browse `My Transcripts`
- if they are not allowed, the viewer denies access even when they know the slug

Link outcomes:

- `410 Gone`: the transcript link expired
- `404 Not Found`: the transcript was revoked, deleted, or the slug is unknown
- pending transcript on the Discord side usually means the bridge is still waiting for transcript creation or later transcript attach

## Service Surface For Other Plugins

Other plugins must use `ot-html-transcripts:service`, not direct SQLite access.

High-value service methods include:

- `resolveTranscript(target)`
- `resolveAdminTarget(target)`
- `listTranscripts(query)`
- `getTranscriptDetail(target)`
- `revokeTranscript(id, reason?)`
- `reissueTranscript(id, reason?)`
- `deleteTranscript(id, reason?)`
- `listViewerAccessibleTranscripts(viewerUserId, viewerAccess, query?)`
- `renderViewerTranscript(slug, viewerUserId, assetBasePath, viewerAccess)`
- `resolveViewerTranscriptAsset(slug, assetName, viewerUserId, viewerAccess)`
- `prepareTranscriptExport(target, format?)`
- `prepareBulkTranscriptExport(ids)`

`ot-eotfs-bridge` uses `resolveAdminTarget()` for transcript URL lookup. Do not replace that with message scraping or direct file-path assumptions.

## Verification

From the Open Ticket repo root:

```bash
npm run build
node --test dist/plugins/ot-html-transcripts/test
```
