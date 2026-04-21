# OT EoTFS Bridge

Local plugin only. Do not treat this as an upstream Open Ticket plugin.

- keep it only in `open-ticket/plugins/ot-eotfs-bridge/`
- do not push it to the upstream base repo
- it depends on `ot-ticket-forms`, `ot-html-transcripts`, and the Discord-side whitelist intake HTTP worker

## What It Does

`ot-eotfs-bridge` owns the OT-side control card for the staged EoTFS whitelist workflow.

Released responsibilities:

1. pre-create gating against Discord-side whitelist ticket eligibility
2. applicant-owned ticket-side handoff from Open Ticket into the Discord-bot whitelist intake worker
3. ticket-side adjudication controls driven by the Discord-bot status and action endpoints
4. pre-close transcript compile plus fallback-only transcript repair delivery
5. bounded apply-closeout polling until the OT ticket can close after terminal whitelist apply success

The bridge is intentionally narrow:

- OT never becomes the authoritative permission gate
- OT never auto-runs Discord `/identity`
- OT never auto-runs Discord `/whitelist`
- OT never creates a second moderation plane outside the Discord-side whitelist workflow

Working-tree-only review-packet refresh behavior, stricter pre-handoff validation details, and control-card placement or repair notes live in [`../../CURRENT_BRANCH.md`](../../CURRENT_BRANCH.md), not in this released README.

## Exact Config Fields

Current [`config.json`](config.json) fields:

- `integrationId`
- `endpointBaseUrl`
- `sharedSecret`
- `eligibleOptionIds`
- `formId`
- `targetGroupKey`
- `authorizedRoleIds`
- `canonicalStaffGuildId`
- `formContract`

Current local sample:

```json
{
  "integrationId": "local-whitelist-intake",
  "endpointBaseUrl": "http://127.0.0.1:8380",
  "sharedSecret": "change-me-local-bridge-secret",
  "eligibleOptionIds": ["whitelist-application-ticket-81642e12"],
  "formId": "whitelist-review-form",
  "targetGroupKey": "community_mirror",
  "authorizedRoleIds": [],
  "canonicalStaffGuildId": "1433418426029834305",
  "formContract": {
    "discordUsernamePosition": 1,
    "alderonIdsPosition": 2,
    "rulesPasswordPosition": 19,
    "requiredAcknowledgementPositions": [5, 6, 7, 8, 9, 17, 18]
  }
}
```

What each field means:

- `integrationId`: path segment sent to the Discord-side intake worker
- `endpointBaseUrl`: base URL for the local intake worker, without the final path segment
- `sharedSecret`: HMAC secret shared with the intake worker
- `eligibleOptionIds`: only these OT ticket option ids get the whitelist bridge gate and control card
- `formId`: completed form id the bridge requires before staging
- `targetGroupKey`: whitelist target group key included in the staged payload
- `authorizedRoleIds`: bridge-only OT-guild role ids that can use whitelist bridge controls in addition to OT admin participants
- `canonicalStaffGuildId`: Discord staff guild id used by OT `Accept` and `Retry Whitelist Apply` when building the canonical caller role context sent to the Discord worker
- `formContract`: bridge-owned mapping for the ticket-creator Discord-name consistency check, the machine-readable AGIDs, the rules password, and the required acknowledgement answers inside the full application

`integrationId` and `sharedSecret` must match:

- the bridge plugin config here
- the Discord-side env values `TICKET_BRIDGE_WHITELIST_INTEGRATION_ID` and `TICKET_BRIDGE_WHITELIST_SHARED_SECRET`

`authorizedRoleIds` is runtime-owned by the OT local env:

- `EOTFS_OT_WHITELIST_BRIDGE_AUTHORIZED_ROLE_IDS=role-id-one,role-id-two`
- values are trimmed, blank entries are dropped, duplicates are removed, and only `17` to `20` digit OT-guild role ids survive normalization
- empty or unset `EOTFS_OT_WHITELIST_BRIDGE_AUTHORIZED_ROLE_IDS` preserves the legacy OT-admin-participant-only bridge behavior
- malformed or OT-guild-unresolved role ids warn and fail closed without blocking OT startup
- this bridge-only role path does not consult `STAFF_BYPASS_ROLE_ID` or cross-guild role membership
- transcript-gated `Accept` and terminal `Retry Whitelist Apply` still must pass the canonical Discord-side whitelist intake permission check when the request reaches the bridge worker

`canonicalStaffGuildId` is runtime-owned by `EOTFS_OT_WHITELIST_CANONICAL_STAFF_GUILD_ID`, with `STAFF_GUILD_ID` accepted as a compatibility fallback. If neither env value is present, the bridge preserves the config value and finally falls back to the OT server id. Operators should set the canonical staff guild explicitly whenever OT tickets and staff authorization do not live in the same Discord guild.

## Rules Password And Form Contract

The OT-side rules-password gate is separate from `config.json` and must come from local runtime env:

- `EOTFS_OT_WHITELIST_RULES_PASSWORDS=password-one,password-two`
- values are trimmed, matched case-insensitively, and may include more than one active password during rotation
- if the env is missing or empty, `Submit for Review` fails closed

`whitelist-review-form` is the full twenty-question whitelist application, not the earlier six-question review form.

Locked machine-owned positions:

- `Q1` is the typed `Discord name` consistency-check field
- `Q2` is the machine-readable `Alderon ID(s)` field
- `Q19` is the rules-password gate
- `Q5`, `Q6`, `Q7`, `Q8`, `Q9`, `Q17`, and `Q18` are required acknowledgement positions

Released hardening rules:

- the typed `Discord name` field must match the live ticket creator username, global name, or server nickname when OT can resolve those aliases
- the `Alderon ID(s)` field must contain one or more AGIDs written as `123456789` or `123-456-789`
- accepted AGIDs are canonicalized to grouped `123-456-789` before the bridge payload is sent
- the bridge rejects duplicate AGIDs after normalization
- this plugin still does not prove live external Alderon-account existence

The form answers live inside the applicant ticket as one managed record through `ot-ticket-forms`. Freeform ticket replies may continue, but only the structured OT application flow mutates the saved whitelist answers.

Released applicant-card contract:

- the applicant resumes from the ticket card, not from dismissed ephemeral prompts
- when saved answers exist and the bridge still allows updates, the ticket card also shows `Edit a saved answer` for one-question corrections
- `Continue Application` only appears when the next form step needs a fresh click or recovery after a saved UI-delivery failure
- `Edit a saved answer` updates only the selected answer, refreshes the managed record, refreshes the ticket card, and stops without replaying later sections
- `Submit for Review` is the only applicant action that stages or refreshes the OT-to-Discord review packet
- active `pending_review` must refresh the applicant card to `Submitted for Staff Review` and lock further edits until staff use `Retry`
- bridge status changes that end applicant editability after review must refresh the applicant card to `Application Locked`
- when staff use `Retry`, the applicant card reopens to `Update Application` and requires `Submit for Review` again for the same staged case
- stale prompts now reply with state-aware recovery copy that points the applicant back to the ticket card

Released whitelist stack contract:

- before submit, the bridge-owned whitelist stack reads: opening whitelist embed, `whitelist-process`, `whitelist-expectations`, and the applicant card as the bottom editable block
- after submit, the bridge keeps the static guidance in place, appends the submitted answers mirror above the applicant card, and then keeps `Whitelist Staff Review` as the newest bottom message directly below the applicant card
- normal submit, retry, transcript, polling, and adjudication refreshes update the managed whitelist stack in place without normal delete-or-recreate churn
- delete-or-recreate is reserved for one-time legacy normalization of already-open misordered tickets and true missing-message recovery

## Released Workflow

1. The player opens an eligible whitelist ticket in Open Ticket.
2. The player starts from `Fill Out Application`, resumes unanswered sections with `Continue Application`, and can use `Update Application` or `Edit a saved answer` from the ticket card to change saved responses without replaying the rest.
3. The applicant uses `Submit for Review`, which blocks malformed AGIDs, a mismatched Discord name, and other plain-language validation failures before staging.
4. The bridge compiles a fresh transcript and posts the signed transcript-backed `case_created` event to the Discord-side intake worker.
5. The Discord bot stages a read-only review case for `/whitelist intake`, and normal review starts from transcript-ready state.
6. `transcript_attached` remains available only for manual repair and legacy staged cases.
7. Staff adjudication continues through the embed-based `Whitelist Staff Review` card plus the Discord-side `/whitelist intake` surface; OT and Discord are co-equal review surfaces that call the same canonical accept and retry-apply path.
8. `Accept` runs canonical `whitelist set`, creates the apply request, and immediately executes one apply pass against every enabled `community_mirror` server with both whitelist-apply and RCON support.
9. OT closes only after duplicate closeout or terminal whitelist apply success.

## Create-Ticket Gate

For eligible whitelist options, the bridge adds a worker on `opendiscord:create-ticket-permissions`.

That worker:

- blocks creation when the Discord bot reports `retry_cooldown`, `limit_lockout`, or a hard-block state
- fails open if the eligibility service is unavailable
- still enforces a fallback duplicate-live-ticket check for eligible options without OT core edits
- warns at startup if an eligible option is not configured with `userMaximum=1`

## Released Control States

Before staging:

- the player completes the whitelist application in the ticket
- the OT staff review card stays hidden until the applicant uses `Submit for Review`

Pending-review case:

- `Accept`
- `Retry`
- `Permanent Denial`
- `Refresh Status`

Retry-denied case:

- `Permanent Denial`
- `Refresh Status`

Limit-locked case:

- `Accept`
- `Permanent Denial`
- `Refresh Status`

Duplicate-active-whitelist case:

- `Close as Duplicate`
- `Refresh Status`

Apply-failed case:

- `Retry Whitelist Apply`
- `Refresh Status`

Pending apply closeout:

- `Refresh Status`

Accepted, permanent-denial, and duplicate-closed terminal states:

- `Refresh Status`

When the bridge moves the staged case out of a reviewable state, `ot-ticket-forms` must refresh the applicant card to `Application Locked` so the bridge remains authoritative for editability.

Applicant-facing OT status copy is now locked to the Discord-side canonical `player_visible_apply_summary` for `accepted_pending_apply` and `accepted_failed`. Technical per-server failure detail stays staff-only in Discord.

Whitelist bridge authorization is live on every interaction:

- OT admin participants remain authorized even when `authorizedRoleIds` is empty
- configured OT-guild bridge roles authorize whitelist bridge controls only; they do not widen claim, rename, close, or other OT admin actions
- bridge buttons and bridge modal submits both re-check the actor's live OT-guild role membership
- canonical Discord-side whitelist intake authorization still decides whether `Accept` or `Retry Whitelist Apply` can execute after the OT-side bridge check passes

Whitelist validation and bridge copy now use plain language:

- the bridge tells staff to fix the application before sending it to review instead of surfacing raw question-number errors
- rules-password, Discord-name, Alderon-ID, and acknowledgement failures are reported with friendly field names
- the staff control card is the embed-based `Whitelist Staff Review` surface with readable case, applicant, lifecycle, policy, and permanent-denial fields plus the released button labels for the current state

## Transcript Handling

The normal whitelist path now stages through transcript-backed `case_created`.

The bridge:

- resolves transcript URLs through `ot-html-transcripts:service.resolveAdminTarget(ticketChannelId)`
- compiles and resolves a fresh transcript before the normal `case_created` handoff
- keeps `transcript_attached` available only for manual repair and legacy staged cases
- rerenders the control card after status changes
- keeps fallback transcript repair additive rather than replacing the original staged case

## Closeout Rules

- `Accept` may complete immediately or leave retries pending, but it never closes the OT ticket until the canonical result is `accepted_applied`
- OT closes the ticket only after terminal whitelist apply success
- `accepted_failed` keeps the ticket open
- `Retry Whitelist Apply` runs one immediate apply pass on the existing accepted case and remains terminal-only
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

## Companion Docs

- [OT Ticket Forms](../ot-ticket-forms/README.md)
- [OT HTML Transcripts](../ot-html-transcripts/README.md)
- [OT Dashboard](../ot-dashboard/README.md)
- [Discord Staff Operator Guide](../../../../EoTFS Discord Bot/docs/staff-operators/README.md)
- [Discord Host / Admin Guide](../../../../EoTFS Discord Bot/docs/host-admin/README.md)

## Verification

From the workspace root:

```bash
npm --prefix open-ticket run build
node --test open-ticket/dist/plugins/ot-eotfs-bridge/test/*.test.js open-ticket/dist/plugins/ot-ticket-forms/test/forms-service.test.js open-ticket/dist/plugins/ot-ticket-forms/test/draft-session.test.js open-ticket/dist/plugins/ot-ticket-forms/test/edit-mode.test.js
```
