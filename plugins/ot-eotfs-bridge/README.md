# OT EoTFS Bridge

Local plugin only. Do not treat this as an upstream Open Ticket plugin.

- keep it only in `open-ticket/plugins/ot-eotfs-bridge/`
- do not push it to the upstream base repo
- it depends on `ot-ticket-forms`, `ot-html-transcripts`, and the Discord-side whitelist intake HTTP worker

## What It Does

`ot-eotfs-bridge` owns the OT-side control card for the staged EoTFS whitelist workflow.

Released responsibilities:

1. pre-create gating against Discord-side whitelist ticket eligibility
2. ticket-side handoff from Open Ticket into the Discord-bot whitelist intake worker
3. ticket-side adjudication controls driven by the Discord-bot status and action endpoints
4. later transcript attach delivery
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
- `formContract`: bridge-owned mapping for the ticket-creator Discord-username consistency check, the machine-readable AGIDs, the rules password, and the required acknowledgement answers inside the full application

`integrationId` and `sharedSecret` must match:

- the bridge plugin config here
- the Discord-side env values `TICKET_BRIDGE_WHITELIST_INTEGRATION_ID` and `TICKET_BRIDGE_WHITELIST_SHARED_SECRET`

## Rules Password And Form Contract

The OT-side rules-password gate is separate from `config.json` and must come from local runtime env:

- `EOTFS_OT_WHITELIST_RULES_PASSWORDS=password-one,password-two`
- values are trimmed, matched case-insensitively, and may include more than one active password during rotation
- if the env is missing or empty, `Send to Staff Review` fails closed

`whitelist-review-form` is the full twenty-question whitelist application, not the earlier six-question review form.

Locked machine-owned positions:

- `Q1` is the typed `Discord username` consistency-check field
- `Q2` is the machine-readable `Alderon ID(s)` field
- `Q19` is the rules-password gate
- `Q5`, `Q6`, `Q7`, `Q8`, `Q9`, `Q17`, and `Q18` are required acknowledgement positions

Released hardening rules:

- `Q1` must match the live ticket creator username, global name, or server nickname when OT can resolve those aliases
- `Q2` must contain one or more AGIDs written as `123456789` or `123-456-789`
- accepted AGIDs are canonicalized to grouped `123-456-789` before the bridge payload is sent
- the bridge rejects duplicate AGIDs after normalization
- this plugin still does not prove live external Alderon-account existence

The form answers live inside the applicant ticket as one managed record through `ot-ticket-forms`. Freeform ticket replies may continue, but only the structured OT application flow mutates the saved whitelist answers.

Released applicant-card contract:

- the applicant resumes from the ticket card, not from dismissed ephemeral prompts
- `Continue Application` only appears when the next form step needs a fresh click or recovery after a saved UI-delivery failure
- bridge status changes that make the review non-editable must refresh the applicant card to `Application Locked`
- when the bridge still allows edits after submission, the applicant card relabels to `Update Application`

## Released Workflow

1. The player opens an eligible whitelist ticket in Open Ticket.
2. The player starts from `Fill Out Application`, resumes with `Continue Application` when modal or recovery clicks are required, and later sees `Update Application` while bridge review remains editable.
3. An OT staff/admin participant uses `Send to Staff Review`, which now blocks malformed AGIDs and Q1 creator-identity mismatches before staging.
4. The bridge posts the signed `case_created` event to the Discord-side intake worker.
5. The Discord bot stages a read-only review case for `/whitelist intake`.
6. `ot-html-transcripts` can later supply a transcript URL, which the bridge posts through `transcript_attached`.
7. Staff adjudication continues through the bridge control card plus the Discord-side status/action endpoints.
8. OT closes only after duplicate closeout or terminal whitelist apply success.

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
- staff use `Send to Staff Review` for the OT-to-Discord handoff

Normal staged case:

- `Accept`
- `Retry`
- `Hard Deny`

Duplicate-active-whitelist case:

- `Close as Duplicate`
- `Refresh Status`

Apply-failed case:

- `Retry Apply`
- `Refresh Status`

Pending apply closeout:

- `Refresh Status`

When the bridge moves the staged case out of a reviewable state, `ot-ticket-forms` must refresh the applicant card to `Application Locked` so the bridge remains authoritative for editability.

## Transcript Handling

After staging, transcript readiness drives a later `transcript_attached` event.

The bridge:

- resolves transcript URLs through `ot-html-transcripts:service.resolveAdminTarget(ticketChannelId)`
- posts the signed transcript event to the Discord bot
- rerenders the control card after status changes
- keeps transcript attach additive rather than replacing the original staged case

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
