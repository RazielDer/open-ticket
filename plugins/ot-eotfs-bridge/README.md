# OT EoTFS Bridge

Local plugin only. Do not treat this as an upstream Open Ticket plugin.

- keep it only in `open-ticket/plugins/ot-eotfs-bridge/`
- do not push it to the upstream base repo
- it depends on `ot-ticket-forms`, `ot-html-transcripts`, and the Discord-side whitelist intake HTTP worker

## What It Does

`ot-eotfs-bridge` owns the OT-side control card for the whitelist ticket adjudication chain.

It now covers four phases:

1. pre-create gating against Discord-side whitelist ticket eligibility
2. ticket-side staging from OT into the Discord-bot whitelist bridge
3. ticket-side adjudication controls driven by the Discord-bot status/action endpoints
4. bounded apply-closeout polling until the OT ticket can close after terminal whitelist apply success

The bridge is intentionally narrow:

- OT never becomes the authoritative permission gate
- OT never edits the reviewed hard-deny target list
- OT never rebinds whitelist attempt history away from the original applicant snapshot
- OT never creates a parallel moderation plane outside the Discord-bot whitelist workflow

## Discord-Side Retry Defaults

The bridge reads retry policy from the Discord bot. The locked runtime defaults are:

- `EOTFS_RUNTIME_WHITELIST_TICKET_MAX_RETRY_DENIALS=99`
- `EOTFS_RUNTIME_WHITELIST_TICKET_RETRY_COOLDOWN_MINUTES=5`
- `EOTFS_RUNTIME_WHITELIST_TICKET_LIMIT_COOLDOWN_MINUTES=43200`

Behavior tied to those defaults:

- duplicate closures do not increment the retry ladder
- the limit attempt produces `limit_locked` plus long lockout instead of automatic hard deny
- the active retry ladder resets only after the long lockout expires
- lifetime totals remain intact even after that reset

## Exact Config Fields

Current [`config.json`](config.json) fields:

- `integrationId`
- `endpointBaseUrl`
- `sharedSecret`
- `eligibleOptionIds`
- `formId`
- `targetGroupKey`

Current local sample:

```json
{
  "integrationId": "local-whitelist-intake",
  "endpointBaseUrl": "http://127.0.0.1:8380",
  "sharedSecret": "change-me-local-bridge-secret",
  "eligibleOptionIds": ["whitelist-application-ticket-81642e12"],
  "formId": "whitelist-review-form",
  "targetGroupKey": "community_mirror"
}
```

What each field means:

- `integrationId`: path segment sent to the Discord-side intake worker
- `endpointBaseUrl`: base URL for the local intake worker, without the final path segment
- `sharedSecret`: HMAC secret shared with the intake worker
- `eligibleOptionIds`: only these OT ticket option ids get the whitelist bridge gate and control card
- `formId`: completed form id the bridge requires before staging
- `targetGroupKey`: whitelist target group key included in the staged payload

`integrationId` and `sharedSecret` must match:

- the bridge plugin config here
- the Discord-side env values `TICKET_BRIDGE_WHITELIST_INTEGRATION_ID` and `TICKET_BRIDGE_WHITELIST_SHARED_SECRET`

## Create-Ticket Gate

For eligible whitelist options, the bridge adds a worker on `opendiscord:create-ticket-permissions`.

That worker:

- blocks creation when the Discord bot reports `retry_cooldown`, `limit_lockout`, or a hard-block state
- fails open if the eligibility service is unavailable
- still enforces a fallback duplicate-live-ticket check for eligible options without OT core edits
- warns at startup if an eligible option is not configured with `userMaximum=1`

The fallback duplicate-live-ticket check stays active even if the option drifted away from `userMaximum=1`.

## Which Tickets Get The Card

Only tickets whose option id appears in `eligibleOptionIds` get the bridge control card.

For eligible tickets:

- the plugin persists exactly one canonical control-card record per ticket
- the record stores the control message id, render state, render version, last policy snapshot, and poll metadata
- restart or message deletion triggers control-card repair by recreating one canonical card

For ineligible tickets:

- no bridge control card is posted
- no whitelist adjudication controls are rendered

## Original Applicant Authority

Applicant identity stays pinned to the original whitelist applicant snapshot.

The bridge resolves that applicant id in this order:

1. completed whitelist form snapshot applicant
2. live OT ticket owner only as fallback when no applicant snapshot exists

If the staged applicant differs from the current ticket owner:

- the bridge keeps the original applicant authoritative
- the control card renders a warning
- whitelist attempt history is not rebound to the transferred owner
- Discord-side dossier and timeline projections mirror that authoritative applicant history onto related Alderon-ID dossiers with explicit labeling

## Control Card Flow

### Before staging

The card shows:

- `Send to whitelist review`
- degraded-state messaging when create-time eligibility failed open and recovery has not happened yet

### Normal staged case

When the Discord bot reports a normal staged reviewable case, the card shows:

- `Accept`
- `Retry`
- `Hard Deny`

Behavior rules:

- `Accept` stays disabled until a real transcript URL is attached
- retry warning text is rendered when the next retry becomes `limit_locked`
- OT never trusts local role membership as final authorization; the bot response is authoritative

### Duplicate-active-whitelist case

When the bot reports `duplicate_active_whitelist=true`, the card shows:

- `Close as Duplicate`
- `Refresh Status`

Duplicate close stays canonical and non-punitive.

### Apply-failed case

When the bot reports `accepted_failed`, the card shows:

- `Retry Apply`
- `Refresh Status`

The ticket stays open in this state.

### Pending apply closeout

When the bot reports `accepted_pending_apply`, the card shows:

- `Refresh Status`

The bridge starts bounded polling against the status endpoint until:

- whitelist apply succeeds and the ticket can close
- whitelist apply fails and the card moves to `Retry Apply` plus `Refresh Status`
- bridge recovery is needed

## Modal Behavior

### Retry

`Retry` opens a modal for the player-visible critique.

If the next retry becomes `limit_locked`, the modal label warns the operator before submit.

### Hard Deny

`Hard Deny` is a confirm-only review flow:

1. the bridge fetches the latest reviewed hard-deny target list from the bot
2. OT shows that list in an ephemeral review message
3. the operator confirms and submits a staff-only rationale modal
4. the backend reuses the Discord-bot `whitelist.workflow.deny` path

OT never adds or removes targets from that reviewed list.

## Transcript Handling

After staging, transcript readiness drives a later `transcript_attached` event.

The bridge:

- resolves transcript URLs through `ot-html-transcripts:service.resolveAdminTarget(ticketChannelId)`
- posts the signed transcript event to the Discord bot
- rerenders the control card immediately afterward
- unlocks `Accept` only once the bot-side case reflects a real transcript URL

## Degraded Behavior

If the bridge cannot reach the Discord bot:

- ticket creation still fails open only at the create-time eligibility gate
- the OT control card renders a degraded state
- adjudication controls stay disabled until recovery
- the bridge keeps bounded poll metadata and retries recovery on its loop

## Closeout Rules

- `Accept` does not close the OT ticket immediately
- OT closes the ticket only after terminal whitelist apply success
- `accepted_failed` keeps the ticket open
- duplicate close can close the ticket immediately after the canonical duplicate action succeeds

## Endpoints

The base target is:

```text
{endpointBaseUrl}/ticket-bridge/intake/whitelist/{integrationId}
```

Operations used by the bridge:

- `POST /ticket-bridge/intake/whitelist/{integrationId}`
  - `case_created`
  - `transcript_attached`
- `POST /ticket-bridge/intake/whitelist/{integrationId}/eligibility`
- `POST /ticket-bridge/intake/whitelist/{integrationId}/status`
- `POST /ticket-bridge/intake/whitelist/{integrationId}/action`

Signed headers:

- `X-Bridge-Timestamp`
- `X-Bridge-Event-Id`
- `X-Bridge-Signature`

## Verification

From the workspace root:

```bash
npm --prefix open-ticket run build
node --test open-ticket/dist/plugins/ot-eotfs-bridge/test/*.test.js open-ticket/dist/plugins/ot-ticket-forms/test/forms-service.test.js
```
